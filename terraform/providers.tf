terraform {
  required_version = ">= 1.9"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.23"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.61"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}

# Authenticates from the CLOUDFLARE_API_TOKEN environment variable.
# The token is never written to this configuration: a committed token in a
# public repository would be a credential leak, and Terraform would store it
# in state either way.
provider "cloudflare" {}

provider "aws" {
  region = var.aws_region

  # Applied to every resource that supports tagging, so anything belonging to
  # this project can be identified without relying on a naming convention.
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
