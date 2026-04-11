variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "lambda_role_arn" {
  description = "ARN of the IAM role for Lambda"
  type        = string
}

variable "firehose_stream_name" {
  description = "Name of the Kinesis Firehose stream"
  type        = string
}