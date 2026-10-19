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

# TEMPORARY: self-signed cert imported into ACM (no public domain yet, so a
# CA-issued cert can't be requested/validated). Browsers will show an
# untrusted-cert warning. Swap for a real ACM-issued cert once a domain
# exists — see docs/decisions/0002-railway-then-aws.md.
alb_acm_certificate_arn = "arn:aws:acm:ap-south-1:336246706489:certificate/761e7421-f0e2-4c75-8cd4-c296d9c90950"
