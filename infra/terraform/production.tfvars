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
