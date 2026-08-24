output "table_name" {
  description = "DynamoDB table holding the daily archive."
  value       = aws_dynamodb_table.archive.name
}

output "table_arn" {
  description = "ARN of the archive table."
  value       = aws_dynamodb_table.archive.arn
}

output "function_name" {
  description = "Archiver function name, for invoking it manually or reading its logs."
  value       = aws_lambda_function.archiver.function_name
}

output "log_group" {
  description = "CloudWatch log group the archiver writes to."
  value       = aws_cloudwatch_log_group.archiver.name
}
