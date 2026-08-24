variable "account_id" {
  description = "Cloudflare account that owns the database."
  type        = string
}

variable "database_name" {
  description = "Name of the D1 database holding the rolling price window."
  type        = string
}
