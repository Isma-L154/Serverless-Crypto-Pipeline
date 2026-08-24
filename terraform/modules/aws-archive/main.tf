terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.61"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  function_name = "${var.name_prefix}-archiver"
  table_name    = "${var.name_prefix}-archive"
  log_group     = "/aws/lambda/${var.name_prefix}-archiver"
}

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

# Permanent daily record, one item per coin per day.
#
# Provisioned rather than on-demand deliberately. The always-free DynamoDB
# allowance covers 25 read and 25 write capacity units in provisioned mode only;
# on-demand bills per request from the first one. This writes roughly five items
# a day, so one unit of each is ample and stays inside the free allowance.
resource "aws_dynamodb_table" "archive" {
  name         = local.table_name
  billing_mode = "PROVISIONED"

  read_capacity  = 1
  write_capacity = 1

  hash_key  = "coin_id"
  range_key = "date"

  attribute {
    name = "coin_id"
    type = "S"
  }

  attribute {
    name = "date"
    type = "S"
  }

  # Point-in-time recovery is billed per gigabyte. The archive is rebuildable
  # from the source API, so it does not justify a standing charge.
  point_in_time_recovery {
    enabled = false
  }
}

# ---------------------------------------------------------------------------
# Function
# ---------------------------------------------------------------------------

# Tests and their pinned dependencies are excluded: they are not needed at
# runtime, and shipping them would put code in the deployment package that
# nothing invokes.
data "archive_file" "archiver" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = "${path.module}/.build/archiver.zip"

  excludes = [
    "test_handler.py",
    "requirements-dev.txt",
    "__pycache__",
    ".pytest_cache",
  ]
}

# Created explicitly rather than left to the Lambda service, which would create
# it on first invocation with unlimited retention. Five gigabytes of ingestion a
# month are free; unbounded retention is how that allowance gets spent.
resource "aws_cloudwatch_log_group" "archiver" {
  name              = local.log_group
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "archiver" {
  function_name = local.function_name
  role          = aws_iam_role.archiver.arn

  filename         = data.archive_file.archiver.output_path
  source_code_hash = data.archive_file.archiver.output_base64sha256

  handler = "handler.lambda_handler"
  runtime = "python3.13"

  # The function makes one outbound call and a handful of writes. The timeout is
  # generous enough to survive a slow upstream without letting a hung request
  # run for minutes.
  timeout     = 30
  memory_size = 256

  environment {
    variables = {
      HISTORY_URL  = var.history_url
      TABLE_NAME   = aws_dynamodb_table.archive.name
      WINDOW_HOURS = tostring(var.window_hours)
    }
  }

  # Without this the function can start before the log group exists and create
  # its own, silently discarding the retention setting above.
  depends_on = [aws_cloudwatch_log_group.archiver]
}

# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "archiver_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "archiver" {
  name               = "${local.function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.archiver_assume.json
}

# Scoped to the two actions the function performs, against the one table it
# writes to. The managed AWSLambdaBasicExecutionRole policy is not used: it
# grants logging across every log group in the account.
data "aws_iam_policy_document" "archiver" {
  statement {
    sid       = "WriteArchiveItems"
    actions   = ["dynamodb:PutItem", "dynamodb:BatchWriteItem"]
    resources = [aws_dynamodb_table.archive.arn]
  }

  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.archiver.arn}:*"]
  }
}

resource "aws_iam_role_policy" "archiver" {
  name   = "${local.function_name}-policy"
  role   = aws_iam_role.archiver.id
  policy = data.aws_iam_policy_document.archiver.json
}

# ---------------------------------------------------------------------------
# Schedule
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    # Without this, any account able to reach the scheduler service could assume
    # the role. It restricts assumption to schedules owned by this account.
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${local.function_name}-scheduler-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    sid       = "InvokeArchiver"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.archiver.arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "${local.function_name}-scheduler-policy"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

# EventBridge Scheduler rather than a classic rule: it allows 14 million
# invocations a month at no cost, against the 30 or so this uses.
resource "aws_scheduler_schedule" "daily" {
  name = "${local.function_name}-daily"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_lambda_function.archiver.arn
    role_arn = aws_iam_role.scheduler.arn

    # A transient upstream failure should not cost a day of history. Beyond
    # these attempts the next run recovers the gap anyway, because the archiver
    # writes every complete day still inside the window.
    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}
