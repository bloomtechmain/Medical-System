# ── Secrets: SSM Parameter Store (standard tier = free) ──────────────────────
# Secrets Manager would be $0.40 per secret per month; Parameter Store
# SecureString gives the same encryption (AWS-managed KMS key, also free) and
# ECS injects either into the container the same way.

resource "random_password" "db" {
  length  = 32
  special = false # avoids URL-escaping trouble in connection strings
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "db_username" {
  name  = "/suwela/prod/db/username"
  type  = "String"
  value = "suwela_admin"
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/suwela/prod/db/password"
  type  = "SecureString"
  value = random_password.db.result
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/suwela/prod/jwt_secret"
  type  = "SecureString"
  value = random_password.jwt.result
}

# Cloudflare Origin CA certificate for api.suwela.com (Cloudflare → server
# leg, "Full (strict)"). Created here with a placeholder; the real PEMs are
# written once with `aws ssm put-parameter --overwrite` (see README) and
# Terraform leaves them alone afterwards.
resource "aws_ssm_parameter" "origin_cert" {
  name  = "/suwela/prod/tls/origin_cert"
  type  = "SecureString"
  value = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "origin_key" {
  name  = "/suwela/prod/tls/origin_key"
  type  = "SecureString"
  value = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

# SMTP login for the registration codes and password-reset emails. Same
# pattern as the certificate: placeholder here, real value written once with
# `aws ssm put-parameter --overwrite` (see README), never in Terraform state.
# Not used until var.smtp_host is set.
resource "aws_ssm_parameter" "smtp_user" {
  name  = "/suwela/prod/smtp/user"
  type  = "SecureString"
  value = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "smtp_password" {
  name  = "/suwela/prod/smtp/password"
  type  = "SecureString"
  value = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

# ── PostgreSQL ───────────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "suwela-prod"
  subnet_ids = [aws_subnet.db_a.id, aws_subnet.db_b.id]
}

resource "aws_db_parameter_group" "pg16" {
  name   = "suwela-prod-pg16"
  family = "postgres16"

  # Same as the old production: the app connects over TLS.
  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot" # static parameter; AWS stores it this way (avoids a permanent diff)
  }
}

resource "aws_db_instance" "main" {
  identifier     = "suwela-prod"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  db_name  = "corehealth"
  username = aws_ssm_parameter.db_username.value
  password = random_password.db.result

  allocated_storage     = 20
  max_allocated_storage = 0 # no storage autoscaling: keeps the bill fixed (an alarm warns at 3 GB free)
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.pg16.name
  publicly_accessible    = false
  multi_az               = false # single-AZ: see AWS_OPTION_A_LEAN_PLAN.md (Multi-AZ is growth stage 4)

  backup_retention_period    = 7             # free up to the 20 GB allocated
  backup_window              = "20:00-20:30" # 01:30–02:00 Sri Lanka time
  maintenance_window         = "sun:21:00-sun:21:30"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  performance_insights_enabled = false
  monitoring_interval          = 0 # enhanced monitoring costs extra

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "suwela-prod-final"

  tags = { Name = "suwela-prod" }
}
