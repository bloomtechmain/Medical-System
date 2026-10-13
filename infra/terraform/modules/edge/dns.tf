# Optional — no real domain is registered yet (see variables.tf). Creates
# nothing until domain_name + hosted_zone_id are both supplied.

resource "aws_route53_record" "frontend" {
  count = var.domain_name != null && var.hosted_zone_id != null ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}
