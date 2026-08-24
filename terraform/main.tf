locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# Hot tier: the database the Worker writes to every five minutes and reads
# from to serve the dashboard.
module "cloudflare" {
  source = "./modules/cloudflare"

  account_id    = var.cloudflare_account_id
  database_name = "${local.name_prefix}-prices"
}

# Cold tier: a daily summary that outlives the two-day window above.
#
# Every resource here sits inside an always-free AWS allowance. See the module
# for why the table is provisioned rather than on-demand.
module "aws_archive" {
  source = "./modules/aws-archive"

  name_prefix = local.name_prefix
  source_dir  = "${path.module}/lambda/archiver"
  history_url = "https://${var.dashboard_host}/api/history"
}
