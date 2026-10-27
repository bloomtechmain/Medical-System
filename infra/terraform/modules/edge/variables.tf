variable "environment" {
  type = string
}

variable "domain_names" {
  description = "The frontend's custom domains — under the three-subdomain split (docs/decisions/0006-three-domain-split.md) this is [www.suwela.com, app.suwela.com, dashboard.suwela.com]: one build, one S3 origin, one CloudFront distribution, three aliases. Empty list (default) means CloudFront serves on its own *.cloudfront.net URL until domains exist."
  type        = list(string)
  default     = []
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone to create ALIAS records in, one per domain_names entry. Null here — suwela.com's DNS is Cloudflare, not Route 53, so these records are added by hand in the Cloudflare dashboard instead (see docs/environments.md, 'Domains (suwela.com)'). Kept for any future domain that does live in Route 53."
  type        = string
  default     = null
}

variable "acm_certificate_arn" {
  description = "Must be issued in us-east-1 regardless of aws_region — a CloudFront-specific requirement, different from the ALB's regional cert (see docs/architecture.md). Null until a domain + cert exist; CloudFront's default certificate is used in the meantime."
  type        = string
  default     = null
}

variable "price_class" {
  description = "PriceClass_100 = North America + Europe edge locations only (cost-conscious default). PriceClass_All covers everywhere, costs more."
  type        = string
  default     = "PriceClass_100"
}
