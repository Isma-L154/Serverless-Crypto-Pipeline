# This file defines the Terraform configuration for the AWS provider and sets default tags for all AWS resources created by this provider.
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "crypto-pipeline"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}