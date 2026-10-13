provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "core-health"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
