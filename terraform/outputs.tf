output "d1_database_id" {
  description = "Value for the D1 binding's database_id in the Worker configuration."
  value       = module.cloudflare.database_id
}

output "d1_database_name" {
  description = "Value for the D1 binding's database_name in the Worker configuration."
  value       = module.cloudflare.database_name
}

output "archive_table_name" {
  description = "DynamoDB table holding the daily archive."
  value       = module.aws_archive.table_name
}

output "archiver_function_name" {
  description = "Archiver function name, for invoking it manually or reading its logs."
  value       = module.aws_archive.function_name
}
