# Optional — creates nothing unless hosted_zone_id is supplied (see
# variables.tf). suwela.com's DNS is Cloudflare, not Route 53, so this stays
# inert for it; the three CNAMEs are added by hand in Cloudflare instead
# (docs/environments.md, "Domains (suwela.com)"). Kept for any future domain
# that does live in Route 53 — one ALIAS record per domain_names entry.

resource "aws_route53_record" "frontend" {
  for_each = var.hosted_zone_id != null ? toset(var.domain_names) : toset([])

  zone_id = var.hosted_zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}
