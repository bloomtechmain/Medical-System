variable "environment" {
  type = string
}

variable "domain_name" {
  description = "e.g. app.corehealth.lk — the frontend's custom domain. No real domain is registered yet, so this defaults to null (CloudFront serves on its own *.cloudfront.net URL until a domain exists)."
  type        = string
  default     = null
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone to create the ALIAS record in. Only used if domain_name is also set."
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
