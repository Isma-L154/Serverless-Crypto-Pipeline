variable "cloudflare_account_id" {
  description = "Cloudflare account that owns the D1 database."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_account_id))
    error_message = "The account ID must be a 32-character hexadecimal string."
  }
}

variable "project_name" {
  description = "Prefix applied to the names of created resources."
  type        = string
  default     = "crypto-pipeline"

  validation {
    condition     = can(regex("^[a-z0-9-]{1,32}$", var.project_name))
    error_message = "Use lowercase letters, digits and hyphens only, up to 32 characters."
  }
}

variable "environment" {
  description = "Deployment environment, used to keep resource names distinct."
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "The environment must be either dev or prod."
  }
}

variable "aws_region" {
  description = "Region hosting the archive tier."
  type        = string
  default     = "us-east-1"
}

variable "dashboard_host" {
  description = "Hostname the Worker serves, which the archiver reads its history from."
  type        = string
  default     = "crypto.cloudils.com"

  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", var.dashboard_host))
    error_message = "Provide a bare hostname, without a scheme or trailing path."
  }
}
