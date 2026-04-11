# Call the IAM module to create IAM roles and policies for the project
module "iam" {
  source = "./modules/iam"

  project_name  = var.project_name
  environment   = var.environment
  s3_bucket_arn = module.s3.bucket_arn
}

# Call the S3 module to create an S3 bucket for storing crypto data
module "s3" {
  source = "./modules/s3"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
}

# Call the Kinesis module to create a Kinesis Firehose delivery stream that writes to the S3 bucket
module "kinesis" {
  source = "./modules/kinesis"

  project_name      = var.project_name
  environment       = var.environment
  s3_bucket_arn     = module.s3.bucket_arn
  s3_bucket_id      = module.s3.bucket_id
  firehose_role_arn = module.iam.firehose_role_arn
}