# Call the IAM module to create IAM roles and policies for the project
module "iam" {
  source = "./modules/iam"

  project_name          = var.project_name
  environment           = var.environment
  s3_bucket_arn         = module.s3.bucket_arn
  s3_athena_results_arn = module.s3.athena_results_bucket_arn
  s3_dashboard_arn      = module.s3.dashboard_bucket_arn
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

# Call the Lambda module to create a Lambda function that fetches crypto prices and sends them to the Kinesis Firehose stream
module "lambda" {
  source = "./modules/lambda"

  project_name          = var.project_name
  environment           = var.environment
  aws_region            = var.aws_region
  lambda_role_arn       = module.iam.lambda_role_arn
  firehose_stream_name  = module.kinesis.firehose_stream_name
  athena_database       = module.glue.database_name
  athena_results_bucket = module.s3.athena_results_bucket
  dashboard_bucket      = module.s3.dashboard_bucket_name
}

# Call the Glue module to create a Glue crawler that catalogs the data in the S3 bucket
module "glue" {
  source = "./modules/glue"

  project_name   = var.project_name
  environment    = var.environment
  s3_bucket_name = module.s3.bucket_name
  glue_role_arn  = module.iam.glue_role_arn
}

# Call the CloudFront module to create a CloudFront distribution that serves the dashboard from the S3 bucket
module "cloudfront" {
  source = "./modules/cloudfront"

  project_name                     = var.project_name
  environment                      = var.environment
  dashboard_bucket_name            = module.s3.dashboard_bucket_name
  dashboard_bucket_regional_domain = module.s3.dashboard_bucket_regional_domain
}
