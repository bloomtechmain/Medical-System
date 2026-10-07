environment = "staging"
aws_region  = "ap-south-1"

# Distinct range from production — never ambiguous if ever viewed side by
# side or (hypothetically) peered.
vpc_cidr = "10.21.0.0/16"

azs = ["ap-south-1a", "ap-south-1b"]

# Single shared NAT — fine for staging regardless of what production ends
# up using; staging doesn't carry the same uptime expectations.
single_nat_gateway = true

# Small and disposable — staging doesn't need production's safety rails.
db_instance_class      = "db.t4g.micro"
db_multi_az            = false
db_deletion_protection = false
db_skip_final_snapshot = true
