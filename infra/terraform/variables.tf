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

variable "domain_names" {
  description = "The frontend's custom domains for CloudFront's aliases. Under the three-subdomain split (docs/decisions/0006-three-domain-split.md) this is [www.suwela.com, app.suwela.com, dashboard.suwela.com] — one SPA build served at all three. Empty list (default) means CloudFront serves on its own *.cloudfront.net URL, which is also what client_url falls back to below. See modules/edge."
  type        = list(string)
  default     = []
}

variable "site_domain_name" {
  description = "Which of domain_names is the 'site' zone — what CLIENT_URL (email links, see server/controllers/authController.ts) and CORS are built from. Always the www. domain, never app./dashboard. Null falls back to CloudFront's own *.cloudfront.net URL, same as domain_names being empty."
  type        = string
  default     = null
}

variable "extra_cors_origins" {
  description = "Comma-separated CORS origins beyond site_domain_name — the app./dashboard. zones. Passed straight through to modules/compute's EXTRA_CORS_ORIGINS. Null adds nothing."
  type        = string
  default     = null
}

variable "hosted_zone_id" {
  description = "Route 53 zone to create DNS records in, one per domain_names entry. Null for suwela.com — its DNS is Cloudflare, not Route 53; those records are added by hand (docs/environments.md)."
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

variable "feature_require_email_verification" {
  description = "See modules/compute/variables.tf — false only where no SMTP provider is configured yet (staging). Must be true (or a real SMTP secret added) before production holds real patient signups."
  type        = bool
  default     = true
}

variable "github_repository" {
  description = "owner/repo — scopes the GitHub Actions OIDC trust policy (github_actions.tf) so only workflows in this repo can assume the deploy role. Not a secret, safe to default."
  type        = string
  default     = "bloomtechmain/Medical-System"
}

variable "extra_ecr_repository_arns" {
  description = "ECR repo ARNs belonging to OTHER environments that this environment's deploy role should also be able to push to — see github_actions.tf's EcrPushPull statement. Cross-workspace state isn't wired up here (staging and production are separate Terraform workspaces with no shared outputs), so this is a manually-copied ARN, not a module reference. Empty by default; set it once a second environment's ECR repo actually exists."
  type        = list(string)
  default     = []
}
