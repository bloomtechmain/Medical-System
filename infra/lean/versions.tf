# Suwela production — "Option A, t3.small" in the production07@bloomtech.lk
# AWS account. A separate Terraform root from infra/terraform (the old,
# ~$310/month multi-server design in account 336246706489) on purpose: this
# one can only ever create the lean stack, so nothing from the old design can
# creep back in and break the budget.
#
# BUDGET: $46.40/month, hard ceiling set by the owner. Every resource here is
# costed in README.md; do not add one without updating that table.

terraform {
  required_version = ">= 1.15"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Local state (terraform.tfstate in this folder, gitignored). An S3 backend
  # would add a bucket + lock table for one operator — not worth it yet.
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  # Refuse to run against any account but the new one. A typo'd profile can
  # never build (or destroy) anything in the old account or anyone else's.
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project     = "suwela"
      Environment = "production"
      ManagedBy   = "terraform-lean"
    }
  }
}

# CloudFront only accepts certificates from us-east-1.
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.aws_profile

  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project     = "suwela"
      Environment = "production"
      ManagedBy   = "terraform-lean"
    }
  }
}
