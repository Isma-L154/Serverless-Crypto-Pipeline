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
