variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "s3_bucket_name" {
  description = "Name of the S3 bucket with crypto data"
  type        = string
}

variable "glue_role_arn" {
  description = "ARN of the IAM role for Glue"
  type        = string
}