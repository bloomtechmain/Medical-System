output "db_instance_id" {
  value = aws_db_instance.this.id
}

output "db_instance_arn" {
  description = "For scoping the CI deploy role's rds:CreateDBSnapshot policy to exactly this instance."
  value       = aws_db_instance.this.arn
}

output "db_instance_identifier" {
  description = "The --db-instance-identifier string (e.g. \"staging-corehealth\") for aws rds create-db-snapshot/wait. NOT db_instance_id above, which is RDS's internal resource ID (\"db-xxxx...\"), not this."
  value       = aws_db_instance.this.identifier
}

output "db_endpoint" {
  description = "host:port — the server's DATABASE_URL / DB_HOST env var gets built from this."
  value       = aws_db_instance.this.endpoint
}

output "db_address" {
  value = aws_db_instance.this.address
}

output "rds_security_group_id" {
  value = aws_security_group.rds.id
}

output "master_user_secret_arn" {
  description = "Secrets Manager ARN holding the auto-generated master password — the ECS task execution role (modules/iam) needs read access to exactly this ARN, nothing broader."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}
