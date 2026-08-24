output "d1_database_id" {
  description = "Value for the D1 binding's database_id in the Worker configuration."
  value       = module.cloudflare.database_id
}

output "d1_database_name" {
  description = "Value for the D1 binding's database_name in the Worker configuration."
  value       = module.cloudflare.database_name
}
