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
variable "s3_athena_results_arn" {
  description = "ARN of the Athena results S3 bucket"
  type        = string
}

variable "s3_dashboard_arn" {
  description = "ARN of the dashboard S3 bucket"
  type        = string
}