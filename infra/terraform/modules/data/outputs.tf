output "db_instance_id" {
  value = aws_db_instance.this.id
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
