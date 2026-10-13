# RDS for PostgreSQL, private-data subnets only (no route to the internet
# at all — see modules/network's private_data route table). One instance
# carries every tenant via schema isolation (public / clinical / tenant_*),
# matching corehealth_database.sql — this is a lift of the existing
# database, not a redesign. See docs/architecture.md.

resource "aws_db_subnet_group" "this" {
  name       = "${var.environment}-rds-subnet-group"
  subnet_ids = values(var.private_data_subnet_ids)

  tags = { Name = "${var.environment}-rds-subnet-group" }
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.environment}-sg-rds-"
  description = "Postgres — inbound 5432 from the compute security group only, no outbound internet needed."
  vpc_id      = var.vpc_id

  tags = { Name = "${var.environment}-sg-rds" }

  lifecycle {
    create_before_destroy = true
  }
}

# One rule per allowed security group, added via for_each so this stays
# correct whether the list is empty (today, pre-compute-module) or has
# entries (once modules/compute exists and is wired in from the root module).
resource "aws_security_group_rule" "rds_ingress" {
  for_each                 = toset(var.allowed_security_group_ids)
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = each.value
}

resource "aws_db_instance" "this" {
  identifier = "${var.environment}-corehealth"
  engine     = "postgres"
  # NOTE: verify this is still a currently-supported RDS Postgres version at
  # apply time (no AWS API access from where this was written) — matches
  # the postgres:16-alpine image used in docker-compose.yml for consistency.
  engine_version = "16.4"

  instance_class        = var.instance_class
  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  # RDS generates and stores the master password in Secrets Manager itself —
  # it never exists in this config, state diffs, or anywhere we'd have to
  # handle it. The ECS task execution role (modules/iam, not yet built) gets
  # read access to this exact secret.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  multi_az                  = var.multi_az
  backup_retention_period   = var.backup_retention_days
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.environment}-corehealth-final"

  # Staging iterates fast; production changes land during a maintenance
  # window instead of immediately.
  apply_immediately = var.environment == "staging"

  tags = { Name = "${var.environment}-corehealth-rds" }
}
