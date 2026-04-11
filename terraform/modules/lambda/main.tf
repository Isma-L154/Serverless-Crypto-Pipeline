# Automatically zip the Python code before uploading to Lambda, (So i can avoid having to manually zip it) 
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.root}/../lambda/producer"
  output_path = "${path.root}/../lambda/producer.zip"
}

# The Lambda function itself (To create the Lambda function, specify the code location, runtime, handler, and environment variables)
resource "aws_lambda_function" "crypto_producer" {
  function_name    = "${var.project_name}-${var.environment}-producer"
  role             = var.lambda_role_arn
  runtime          = "python3.12"
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  # How much memory and time Lambda has to run
  memory_size = 128
  timeout     = 30

  # Environment variables available inside the Python code
  environment {
    variables = {
      FIREHOSE_STREAM_NAME = var.firehose_stream_name
    }
  }
}

# CloudWatch Log Group for Lambda logs
# Create it explicitly to control the retention period
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${aws_lambda_function.crypto_producer.function_name}"
  retention_in_days = 7
}

# EventBridge rule (Basically the scheduler that triggers the Lambda every 5 minutes)
resource "aws_cloudwatch_event_rule" "every_5_minutes" {
  name                = "${var.project_name}-${var.environment}-schedule"
  description         = "Trigger crypto producer Lambda every 5 minutes"
  schedule_expression = "rate(5 minutes)"
}

# Connect the EventBridge rule to the Lambda function
resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.every_5_minutes.name
  target_id = "CryptoProducerLambda"
  arn       = aws_lambda_function.crypto_producer.arn
}

# Allow EventBridge to invoke the Lambda function
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.crypto_producer.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.every_5_minutes.arn
}