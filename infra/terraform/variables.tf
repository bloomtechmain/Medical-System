variable "environment" {
  description = "Deployment environment name — used for resource naming/tagging and to pick sizing defaults (e.g. \"staging\" or \"production\")."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be \"staging\" or \"production\"."
  }
}

variable "aws_region" {
  description = "AWS region — ap-south-1 (Mumbai) is closest to Sri Lanka, matching the rest of this project's planning docs."
  type        = string
  default     = "ap-south-1"
}

variable "vpc_cidr" {
  description = "CIDR block for this environment's VPC. Staging and production get different ranges so they're never ambiguous if ever peered or viewed side by side."
  type        = string
}

variable "azs" {
  description = "Availability Zones to spread subnets/compute across. Exactly 2 for this architecture (see docs/architecture.md)."
  type        = list(string)

  validation {
    condition     = length(var.azs) == 2
    error_message = "This architecture is designed for exactly 2 Availability Zones."
  }
}

variable "single_nat_gateway" {
  description = "true = one shared NAT Gateway (cost-conscious default, see docs/single-points-of-failure.md). false = one NAT Gateway per AZ, full redundancy — the documented upgrade path."
  type        = bool
  default     = true
}

variable "db_instance_class" {
  description = "e.g. db.t4g.micro (staging) or db.t4g.small (production)."
  type        = string
}

variable "db_multi_az" {
  description = "See docs/single-points-of-failure.md — false (Single-AZ) is the accepted starting tradeoff; flip to true before accepting real patient traffic."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  type = bool
}

variable "db_skip_final_snapshot" {
  type = bool
}
