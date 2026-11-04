variable "aws_account_id" {
  description = "The production07@bloomtech.lk AWS account ID (12 digits). Terraform refuses to touch any other account."
  type        = string
}

variable "aws_profile" {
  description = "AWS CLI profile for that account."
  type        = string
  default     = "suwela-prod"
}

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "budget_limit_usd" {
  description = "Hard monthly ceiling set by the owner."
  type        = string
  default     = "46.40"
}

variable "budget_alert_email" {
  type    = string
  default = "production07@bloomtech.lk"
}

variable "github_repository" {
  type    = string
  default = "bloomtechmain/Medical-System"
}

variable "root_domain" {
  type    = string
  default = "suwela.com"
}

variable "site_host" {
  type    = string
  default = "www.suwela.com"
}

variable "app_host" {
  type    = string
  default = "app.suwela.com"
}

variable "dashboard_host" {
  type    = string
  default = "dashboard.suwela.com"
}

variable "admin_host" {
  description = "Second name for the admin (dashboard) zone."
  type        = string
  default     = "admin.suwela.com"
}

variable "api_host" {
  type    = string
  default = "api.suwela.com"
}

variable "instance_type" {
  description = "t3.small (2 GB): report reading (OCR) needs the memory. Do not drop to t3.micro."
  type        = string
  default     = "t3.small"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "container_image_tag" {
  description = "Image tag the first task definition points at. CI replaces it on every deploy."
  type        = string
  default     = "latest"
}

variable "feature_require_email_verification" {
  description = "New accounts must enter the emailed 6-digit code. Only takes effect when smtp_host is set (no mail path = no codes)."
  type        = bool
  default     = true
}

# ── Email (SMTP) ──────────────────────────────────────────────────────────────
# Empty smtp_host = no mail: the API logs emails instead of sending them and
# email verification stays off. The SMTP username/password live in SSM
# (/suwela/prod/smtp/user, /suwela/prod/smtp/password), not here.
variable "smtp_host" {
  description = "SMTP server, e.g. smtp.gmail.com / smtp.zoho.com / email-smtp.ap-south-1.amazonaws.com. Empty = mail off."
  type        = string
  default     = ""
}

variable "smtp_port" {
  description = "587 (STARTTLS, smtp_secure = false) or 465 (TLS, smtp_secure = true). Port 25 is blocked on EC2."
  type        = number
  default     = 587
}

variable "smtp_secure" {
  type    = bool
  default = false
}

variable "smtp_from" {
  description = "From header. Must be an address the SMTP account may send as."
  type        = string
  default     = "Suwela Medical Hub <no-reply@suwela.com>"
}

# ── Google sign-in (patients only) ───────────────────────────────────────────
variable "google_client_id" {
  description = "Google OAuth 2.0 Web client id. Public (the browser gets it too). Empty = no Google button."
  type        = string
  default     = ""
}

variable "cloudflare_ipv4_ranges" {
  description = "Only Cloudflare may reach the server on 443 (https://www.cloudflare.com/ips-v4, fetched 2026-11-03)."
  type        = list(string)
  default = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
    "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
    "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  ]
}

variable "cloudfront_aliases" {
  description = <<-EOT
    Names CloudFront answers for. Defaults to all four web hosts. During the
    move from the old account it is temporarily just the hosts the old
    account's distribution does not hold (a name can be on only one
    distribution worldwide); the rest are moved with `aws cloudfront
    associate-alias` and this goes back to the default.
  EOT
  type        = list(string)
  default     = null
}

variable "enable_cloudfront" {
  description = "Serve the website through CloudFront instead of the server's proxy. Needs the account verified by AWS Support first."
  type        = bool
  default     = false
}
