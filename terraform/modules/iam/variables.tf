variable "project_name" {
  description = "Project name to be used in IAM role names and policies"
  type        = string
}

variable "environment" {
  description = "Project environment"
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 bucket where Firehose will write"
  type        = string
}