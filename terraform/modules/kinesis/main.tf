
# This Terraform module creates an AWS Kinesis Firehose delivery stream that writes data to an S3 bucket.
resource "aws_kinesis_firehose_delivery_stream" "crypto_stream" {
  name        = "${var.project_name}-${var.environment}-stream"
  destination = "extended_s3"

  extended_s3_configuration {
    role_arn   = var.firehose_role_arn
    bucket_arn = var.s3_bucket_arn

    # Prefix defines the folder structure in S3
    # This creates partitions by year/month/day/hour automatically -> (Using a Year/Month/Day/Hour structure is mainly about making data cheaper and faster to work with at scale.)
    prefix              = "crypto/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/hour=!{timestamp:HH}/"
    error_output_prefix = "errors/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/!{firehose:error-output-type}/" # This creates a separate folder for errors

    # Buffer settings, to config how often Firehose writes to S3
    # 60 seconds or 5MB, whichever comes first
    buffering_interval = 60
    buffering_size     = 5

    compression_format = "UNCOMPRESSED"
  }
}