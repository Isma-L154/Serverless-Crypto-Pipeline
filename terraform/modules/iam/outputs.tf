output "firehose_role_arn" {
  description = "ARN of the Firehose role"
  value       = aws_iam_role.firehose_role.arn
}

output "lambda_role_arn" {
  description = "ARN of the Lambda role"
  value       = aws_iam_role.lambda_role.arn
}
output "glue_role_arn" {
  description = "ARN of the Glue IAM role"
  value       = aws_iam_role.glue_role.arn
}