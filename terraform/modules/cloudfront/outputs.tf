output "cloudfront_url" {
  description = "Public CloudFront URL of the dashboard"
  value       = "https://${aws_cloudfront_distribution.dashboard.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.dashboard.id
}