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

variable "compute_instance_type" {
  type    = string
  default = "t3.small"
}

variable "compute_asg_min_size" {
  type    = number
  default = 2
}

variable "compute_asg_max_size" {
  type    = number
  default = 4
}

variable "compute_desired_count" {
  type    = number
  default = 2
}

variable "domain_name" {
  description = "e.g. app.corehealth.lk. No real domain is registered yet — null means CloudFront serves on its own *.cloudfront.net URL, and that's also what CLIENT_URL (and therefore CORS) uses in the meantime. See modules/edge."
  type        = string
  default     = null
}

variable "hosted_zone_id" {
  description = "Route 53 zone to create the DNS record in. Only used if domain_name is also set."
  type        = string
  default     = null
}

variable "alb_acm_certificate_arn" {
  description = "ACM cert for the ALB's HTTPS listener, issued in aws_region. No default — must be requested and supplied before this can actually apply; validate still passes without it."
  type        = string
}

variable "cloudfront_acm_certificate_arn" {
  description = "ACM cert for CloudFront — MUST be issued in us-east-1 regardless of aws_region, a CloudFront-specific requirement, so this is a separate cert from alb_acm_certificate_arn. Null is fine (uses CloudFront's default certificate) until a custom domain exists."
  type        = string
  default     = null
}
