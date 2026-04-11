# Database in Glue Data Catalog (This is where the crawler will store metadata about the tables it creates)
resource "aws_glue_catalog_database" "crypto_db" {
  name        = "${var.project_name}_${var.environment}_db"
  description = "Database for crypto pipeline data"
}

# Crawler - scans S3 and automatically detects schema
resource "aws_glue_crawler" "crypto_crawler" {
  name          = "${var.project_name}-${var.environment}-crawler"
  role          = var.glue_role_arn
  database_name = aws_glue_catalog_database.crypto_db.name
  description   = "Crawls crypto data from S3 and updates the Data Catalog"

  # Points to the root folder - crawler will scan all partitions
  s3_target {
    path = "s3://${var.s3_bucket_name}/crypto/"
  }

  # How often the crawler runs (I put it to run every 5 minutes)
  schedule = "cron(0/5 * * * ? *)"

  # Automatically detect partition changes
  configuration = jsonencode({
    Version = 1.0
    CrawlerOutput = {
      Partitions = {
        AddOrUpdateBehavior = "InheritFromTable"
      }
    }
    Grouping = {
      TableGroupingPolicy = "CombineCompatibleSchemas"
    }
  })

  schema_change_policy {
    delete_behavior = "LOG"
    update_behavior = "UPDATE_IN_DATABASE"
  }
}