terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.23"
    }
  }
}

# Holds the rolling window of price observations that the dashboard reads.
#
# The Worker keeps roughly two days of data here and prunes anything older on
# every run, so the database stays a few megabytes against a 5 GB free-tier
# allowance. Long-term history lives in the AWS archive tier instead.
#
# No location hint is set: Cloudflare places the primary close to where the
# database is created, which is a better default than guessing a region.
#
# Replacing this database destroys its contents, which is acceptable here: the
# window refills within two days and the durable history is held in AWS. That
# is a deliberate property of the hot tier, not an oversight.
resource "cloudflare_d1_database" "prices" {
  account_id = var.account_id
  name       = var.database_name
}
