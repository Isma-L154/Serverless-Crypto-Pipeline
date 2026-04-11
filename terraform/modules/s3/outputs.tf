output "bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.crypto_data.bucket
}

output "bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.crypto_data.arn
}

output "bucket_id" {
  description = "ID of the S3 bucket"
  value       = aws_s3_bucket.crypto_data.id
}