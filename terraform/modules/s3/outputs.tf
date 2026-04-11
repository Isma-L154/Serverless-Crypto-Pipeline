output "bucket_name" {
  description = "Name of the crypto data S3 bucket"
  value       = aws_s3_bucket.crypto_data.bucket
}

output "bucket_arn" {
  description = "ARN of the crypto data S3 bucket"
  value       = aws_s3_bucket.crypto_data.arn
}

output "bucket_id" {
  description = "ID of the crypto data S3 bucket"
  value       = aws_s3_bucket.crypto_data.id
}

output "athena_results_bucket" {
  description = "Name of the Athena results S3 bucket"
  value       = aws_s3_bucket.athena_results.bucket
}

output "dashboard_bucket_name" {
  description = "Name of the dashboard S3 bucket"
  value       = aws_s3_bucket.dashboard.bucket
}

output "dashboard_bucket_arn" {
  description = "ARN of the dashboard S3 bucket"
  value       = aws_s3_bucket.dashboard.arn
}

output "dashboard_url" {
  description = "Public URL of the dashboard"
  value       = "http://${aws_s3_bucket_website_configuration.dashboard.website_endpoint}"
}
output "athena_results_bucket_arn" {
  description = "ARN of the Athena results bucket"
  value       = aws_s3_bucket.athena_results.arn
}
output "dashboard_bucket_regional_domain" {
  description = "Regional domain name of the dashboard bucket"
  value       = aws_s3_bucket.dashboard.bucket_regional_domain_name
}