terraform {
  required_version = ">= 1.9"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.23"
    }
  }
}

# Authenticates from the CLOUDFLARE_API_TOKEN environment variable.
# The token is never written to this configuration: a committed token in a
# public repository would be a credential leak, and Terraform would store it
# in state either way.
provider "cloudflare" {}
