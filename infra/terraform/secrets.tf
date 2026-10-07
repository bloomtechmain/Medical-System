# JWT_SECRET, unlike the RDS password, isn't AWS-managed — it's generated
# here, once, and stored in Secrets Manager. Terraform never requires a
# human to type a plaintext secret into any file; the only place this value
# exists in plaintext is local Terraform state (see versions.tf's note on
# moving to a remote backend — that's when this should also move behind
# encryption-at-rest for state, not before).
#
# Lives at the root (not inside modules/iam or modules/compute) because both
# of those modules need its ARN — iam to grant read access, compute to wire
# it into the task definition — and neither should depend on the other.

resource "random_password" "jwt_secret" {
  length  = 64
  special = false # JWT_SECRET just needs entropy, not symbol variety
}

resource "aws_secretsmanager_secret" "jwt" {
  name = "${var.environment}/corehealth/jwt-secret"
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = random_password.jwt_secret.result
}
