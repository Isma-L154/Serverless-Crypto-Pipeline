# ─── Layer ───────────────────────────────────────────────────────────

# Zip the dependencies layer
data "archive_file" "dependencies_layer_zip" {
  type        = "zip"
  source_dir  = "${path.root}/../lambda/layers/dependencies"
  output_path = "${path.root}/../lambda/layers/dependencies.zip"
}

# Upload layer zip to S3 first (too large for direct upload, limit is 70MB)
resource "aws_s3_object" "dependencies_layer" {
  bucket     = var.dashboard_bucket
  key        = "layers/dependencies.zip"
  source     = "${path.root}/../lambda/layers/dependencies.zip"
  etag       = data.archive_file.dependencies_layer_zip.output_md5
  depends_on = [data.archive_file.dependencies_layer_zip]
}

# Create the Lambda Layer from S3
resource "aws_lambda_layer_version" "dependencies" {
  layer_name          = "${var.project_name}-${var.environment}-dependencies"
  s3_bucket           = var.dashboard_bucket
  s3_key              = aws_s3_object.dependencies_layer.key
  source_code_hash    = data.archive_file.dependencies_layer_zip.output_base64sha256
  compatible_runtimes = ["python3.11", "python3.12"]
  description         = "Shared dependencies: pandas, plotly, pyathena, requests"
  depends_on          = [aws_s3_object.dependencies_layer]
}

# ─── Producer Lambda ─────────────────────────────────────────────────

# Automatically zip the producer code
data "archive_file" "producer_zip" {
  type        = "zip"
  source_dir  = "${path.root}/../lambda/producer"
  output_path = "${path.root}/../lambda/producer.zip"
}

# Producer Lambda - fetches crypto data and sends to Firehose
resource "aws_lambda_function" "crypto_producer" {
  function_name    = "${var.project_name}-${var.environment}-producer"
  role             = var.lambda_role_arn
  runtime          = "python3.12"
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.producer_zip.output_path
  source_code_hash = data.archive_file.producer_zip.output_base64sha256
  memory_size      = 128
  timeout          = 30
  layers           = [aws_lambda_layer_version.dependencies.arn]

  environment {
    variables = {
      FIREHOSE_STREAM_NAME = var.firehose_stream_name
    }
  }
}

# CloudWatch Log Group for producer Lambda
resource "aws_cloudwatch_log_group" "producer_logs" {
  name              = "/aws/lambda/${aws_lambda_function.crypto_producer.function_name}"
  retention_in_days = 7
}

# EventBridge rule - triggers producer every 5 minutes
resource "aws_cloudwatch_event_rule" "every_5_minutes" {
  name                = "${var.project_name}-${var.environment}-schedule"
  description         = "Trigger crypto producer Lambda every 5 minutes"
  schedule_expression = "rate(5 minutes)"
}

# Connect EventBridge to producer Lambda
resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.every_5_minutes.name
  target_id = "CryptoProducerLambda"
  arn       = aws_lambda_function.crypto_producer.arn
}

# Allow EventBridge to invoke producer Lambda
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.crypto_producer.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.every_5_minutes.arn
}

# ─── Dashboard Lambda ─────────────────────────────────────────────────

# Automatically zip the dashboard code
data "archive_file" "dashboard_zip" {
  type        = "zip"
  source_dir  = "${path.root}/../lambda/dashboard"
  output_path = "${path.root}/../lambda/dashboard.zip"
}

# Dashboard Lambda - queries Athena and generates HTML dashboard
resource "aws_lambda_function" "crypto_dashboard" {
  function_name    = "${var.project_name}-${var.environment}-dashboard"
  role             = var.lambda_role_arn
  runtime          = "python3.11"
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.dashboard_zip.output_path
  source_code_hash = data.archive_file.dashboard_zip.output_base64sha256
  memory_size      = 512
  timeout          = 120
  layers           = [aws_lambda_layer_version.dependencies.arn]

  environment {
    variables = {
      ATHENA_DATABASE       = var.athena_database
      ATHENA_RESULTS_BUCKET = var.athena_results_bucket
      DASHBOARD_BUCKET      = var.dashboard_bucket
      AWS_REGION_NAME       = var.aws_region
    }
  }
}

# CloudWatch Log Group for dashboard Lambda
resource "aws_cloudwatch_log_group" "dashboard_logs" {
  name              = "/aws/lambda/${aws_lambda_function.crypto_dashboard.function_name}"
  retention_in_days = 7
}

# EventBridge rule - triggers dashboard every hour
resource "aws_cloudwatch_event_rule" "dashboard_schedule" {
  name                = "${var.project_name}-${var.environment}-dashboard-schedule"
  description         = "Trigger dashboard Lambda every hour"
  schedule_expression = "rate(1 hour)"
}

# Connect EventBridge to dashboard Lambda
resource "aws_cloudwatch_event_target" "dashboard_target" {
  rule      = aws_cloudwatch_event_rule.dashboard_schedule.name
  target_id = "CryptoDashboardLambda"
  arn       = aws_lambda_function.crypto_dashboard.arn
}

# Allow EventBridge to invoke dashboard Lambda
resource "aws_lambda_permission" "allow_eventbridge_dashboard" {
  statement_id  = "AllowEventBridgeInvokeDashboard"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.crypto_dashboard.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.dashboard_schedule.arn
}