variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "dashboard_bucket_name" {
  description = "Name of the S3 dashboard bucket"
  type        = string
}

variable "dashboard_bucket_regional_domain" {
  description = "Regional domain name of the S3 dashboard bucket"
  type        = string
}