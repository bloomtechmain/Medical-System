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

# TEMPORARY: no SMTP provider configured yet, so the app refuses to start
# with email verification required (see mailer.ts). Fine for a disposable
# staging smoke test; must be reverted (or real SMTP added) before this ever
# holds data people might mistake for real registrations.
feature_require_email_verification = false

# TEMPORARY: self-signed cert imported into ACM (no public domain yet). Same
# cert reused across staging/production since it isn't environment-specific.
# Browsers will show an untrusted-cert warning. Swap for a real ACM-issued
# cert once a domain exists — see docs/decisions/0002-railway-then-aws.md.
alb_acm_certificate_arn = "arn:aws:acm:ap-south-1:336246706489:certificate/761e7421-f0e2-4c75-8cd4-c296d9c90950"

# deploy.yml's shared `build` job runs under staging's role (it's the one
# with ref:refs/heads/main trust) and now needs to push the same image to
# production's ECR repo too, not just this one — see github_actions.tf.
extra_ecr_repository_arns = ["arn:aws:ecr:ap-south-1:336246706489:repository/production-corehealth-api"]
