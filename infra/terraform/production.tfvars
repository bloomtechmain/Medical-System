environment = "production"
aws_region  = "ap-south-1"

# Matches the CIDR used throughout docs/architecture.md and the AWS
# deployment doc shared earlier in planning.
vpc_cidr = "10.20.0.0/16"

azs = ["ap-south-1a", "ap-south-1b"]

# Cost-conscious default, documented as an accepted tradeoff in
# docs/single-points-of-failure.md. Flip to false (one NAT per AZ, full
# redundancy, ~$33/mo more) when/if that tradeoff stops being acceptable —
# no other change needed, the module already supports both.
single_nat_gateway = true

db_instance_class = "db.t4g.small"
# Single-AZ to start (see docs/single-points-of-failure.md) — flip to true
# before accepting real patient traffic, ~doubles the RDS line item.
db_multi_az            = false
db_deletion_protection = true
db_skip_final_snapshot = false

# suwela.com exists now (Cloudflare) — see docs/decisions/0006-three-domain-
# split.md and docs/environments.md ("Domains (suwela.com)"). One SPA build,
# three CloudFront aliases; the API keeps its own subdomain since nothing
# about Bearer-token auth requires the API and client to share an origin.
domain_names       = ["www.suwela.com", "app.suwela.com", "dashboard.suwela.com"]
site_domain_name   = "www.suwela.com"
extra_cors_origins = "https://app.suwela.com,https://dashboard.suwela.com"

# Real, CA-issued, DNS-validated certs — requested via ACM once suwela.com's
# DNS existed to validate against, validated via Cloudflare CNAMEs (not
# Route 53 — see docs/environments.md), ISSUED 2026-10-27. Replaces the old
# self-signed placeholder cert that predated the domain. alb_acm_certificate_arn
# covers api.suwela.com; cloudfront_acm_certificate_arn (root variables.tf)
# is the matching us-east-1 cert for www/app/dashboard.
alb_acm_certificate_arn = "arn:aws:acm:ap-south-1:336246706489:certificate/1962d059-7aa9-428f-ae9f-e4525afbadfd"
# MUST be issued in us-east-1 regardless of aws_region above — CloudFront
# requirement. Covers all three of domain_names (one cert, three SANs).
cloudfront_acm_certificate_arn = "arn:aws:acm:us-east-1:336246706489:certificate/f27c1385-b906-4dff-b0e3-e874e243e6a8"
