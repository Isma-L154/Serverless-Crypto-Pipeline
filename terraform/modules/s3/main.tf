# Main bucket where all crypto data will be stored
resource "aws_s3_bucket" "crypto_data" {
  bucket = "${var.project_name}-${var.environment}-data-${random_id.suffix.hex}"

  lifecycle {
    prevent_destroy = false
  }
}

# Random suffix to ensure bucket name is globally unique
resource "random_id" "suffix" {
  byte_length = 4
}

# Block all public access to the bucket(Is not a Static Web jeje)
resource "aws_s3_bucket_public_access_block" "crypto_data" {
  bucket = aws_s3_bucket.crypto_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning in the bucket(Good practice for this data pipeline)
resource "aws_s3_bucket_versioning" "crypto_data" {
  bucket = aws_s3_bucket.crypto_data.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Lifecycle rule for expiring old data
resource "aws_s3_bucket_lifecycle_configuration" "crypto_data" {
  bucket = aws_s3_bucket.crypto_data.id

  rule {
    id     = "expire-old-data"
    status = "Enabled"

    expiration {
      days = 90
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# Enable server-side encryption by default (Rather use SSE-S3 than KMS for simplicity in this case)
resource "aws_s3_bucket_server_side_encryption_configuration" "crypto_data" {
  bucket = aws_s3_bucket.crypto_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}