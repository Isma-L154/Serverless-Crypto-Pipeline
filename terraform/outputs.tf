# Outputs for the project (Defines the outputs that will be displayed after Terraform applies the configuration)
output "dashboard_url" {
  description = "Public URL of the crypto dashboard"
  value       = module.s3.dashboard_url
}

output "dashboard_bucket" {
  description = "Name of the dashboard S3 bucket"
  value       = module.s3.dashboard_bucket_name
}
output "cloudfront_url" {
  description = "Public CloudFront URL of the dashboard"
  value       = module.cloudfront.cloudfront_url
}