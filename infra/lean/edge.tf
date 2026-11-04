# Website: S3 (private) behind CloudFront, serving all four names:
#   www.suwela.com, app.suwela.com, dashboard.suwela.com, admin.suwela.com
# One SPA build; the app decides which zone it is in from the hostname.
#
# Bucket names are global, so they carry the account ID (the old account's
# names cannot be reused while those buckets still exist).

locals {
  web_hosts = [var.site_host, var.app_host, var.dashboard_host, var.admin_host]
}

resource "aws_s3_bucket" "frontend" {
  bucket = "suwela-prod-frontend-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "uploads" {
  bucket = "suwela-prod-uploads-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

# Versioning: an accidentally deleted or overwritten medical report can be
# recovered for 30 days. Costs cents at this size.
resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    id     = "old-versions-30-days"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 30 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
}

# ── HTTPS certificate for the four web names (must live in us-east-1) ───────
# Validated by DNS: the CNAMEs in output `acm_validation_records` go into
# Cloudflare (DNS only, not proxied). Free.

resource "aws_acm_certificate" "web" {
  provider                  = aws.us_east_1
  domain_name               = var.site_host
  subject_alternative_names = [var.app_host, var.dashboard_host, var.admin_host]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_acm_certificate_validation" "web" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.web.arn
  timeouts { create = "2h" }
}

# ── CloudFront (optional) ───────────────────────────────────────────────────
# The website is normally served by the server's HTTPS proxy straight from the
# bucket (through the free S3 gateway endpoint), with Cloudflare caching in
# front — see compute.tf. CloudFront is kept as an option for later: a new
# AWS account cannot create CloudFront resources until AWS Support verifies
# it, and with Cloudflare in front it adds nothing the budget needs.

resource "aws_cloudfront_origin_access_control" "frontend" {
  count                             = var.enable_cloudfront ? 1 : 0
  name                              = "suwela-prod-frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "optimized" {
  count = var.enable_cloudfront ? 1 : 0
  name  = "Managed-CachingOptimized"
}

data "aws_cloudfront_response_headers_policy" "security" {
  count = var.enable_cloudfront ? 1 : 0
  name  = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_distribution" "web" {
  count               = var.enable_cloudfront ? 1 : 0
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Suwela web (www/app/dashboard/admin)"
  aliases             = coalesce(var.cloudfront_aliases, local.web_hosts)
  default_root_object = "index.html"
  price_class         = "PriceClass_200"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend[0].id
  }

  default_cache_behavior {
    target_origin_id           = "frontend"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized[0].id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security[0].id
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.web.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# Who may read the website files:
#   * the server's HTTPS proxy, but only through this VPC's S3 endpoint (the
#     files are not public on the internet);
#   * CloudFront, if it is switched on.
data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    sid       = "ServerProxyViaVpcEndpoint"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceVpce"
      values   = [aws_vpc_endpoint.s3.id]
    }
  }

  dynamic "statement" {
    for_each = var.enable_cloudfront ? [1] : []
    content {
      sid       = "CloudFront"
      actions   = ["s3:GetObject"]
      resources = ["${aws_s3_bucket.frontend.arn}/*"]
      principals {
        type        = "Service"
        identifiers = ["cloudfront.amazonaws.com"]
      }
      condition {
        test     = "StringEquals"
        variable = "AWS:SourceArn"
        values   = [aws_cloudfront_distribution.web[0].arn]
      }
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket.json
}
