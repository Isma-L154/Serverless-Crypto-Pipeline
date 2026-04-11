variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
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

variable "athena_database" {
  description = "Glue database name for Athena queries"
  type        = string
}

variable "athena_results_bucket" {
  description = "S3 bucket for Athena query results"
  type        = string
}

variable "dashboard_bucket" {
  description = "S3 bucket where dashboard HTML will be uploaded"
  type        = string
}