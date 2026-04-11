output "database_name" {
  description = "Name of the Glue database"
  value       = aws_glue_catalog_database.crypto_db.name
}

output "crawler_name" {
  description = "Name of the Glue crawler"
  value       = aws_glue_crawler.crypto_crawler.name
}