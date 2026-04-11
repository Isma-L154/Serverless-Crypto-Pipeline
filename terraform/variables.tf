# This file defines the Terraform variables used in the project, including their descriptions, types, and default values.
variable "aws_region" {
  description = "AWS region where the project is deployed"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Project Environment"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Name for the project, used in resource naming"
  type        = string
  default     = "crypto-pipeline"
}