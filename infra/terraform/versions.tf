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

  # Local state for now (a terraform.tfstate file on disk, gitignored) — needs
  # no AWS access at all. Move to an S3 backend (with DynamoDB state locking)
  # once the AWS side exists; that's itself one of the first things to
  # provision, since the backend can't depend on the infrastructure it manages.
}
