terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
#Default tags for all AWS resources created by this provider
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