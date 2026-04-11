# This file defines the Terraform configuration for the AWS provider and sets default tags for all AWS resources created by this provider.
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = { # Used for generating the random suffix for the S3 bucket name, so i can avoid naming conflicts since S3 bucket names must be globally unique
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    archive = { # Used for packaging the Lambda function code, so i can easily upload it to AWS Lambda without having to manually zip it and upload it every time i make a change
      source  = "hashicorp/archive"
      version = "~> 2.0"
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