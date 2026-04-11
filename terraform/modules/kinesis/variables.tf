variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 bucket where Firehose will deliver data"
  type        = string
}

variable "s3_bucket_id" {
  description = "ID of the S3 bucket where Firehose will deliver data"
  type        = string
}

variable "firehose_role_arn" {
  description = "ARN of the IAM role for Firehose"
  type        = string
}