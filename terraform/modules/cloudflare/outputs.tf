output "database_id" {
  description = "D1 database UUID, needed by the Worker's binding configuration."
  value       = cloudflare_d1_database.prices.uuid
}

output "database_name" {
  description = "D1 database name."
  value       = cloudflare_d1_database.prices.name
}
