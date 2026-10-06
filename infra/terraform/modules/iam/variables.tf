variable "environment" {
  type = string
}

variable "db_secret_arn" {
  description = "From modules/data's master_user_secret_arn output — the ECS task execution role gets read access to exactly this ARN, nothing broader."
  type        = string
}

variable "jwt_secret_arn" {
  description = "From modules/compute's Secrets Manager secret for JWT_SECRET — same scoped-read pattern as db_secret_arn."
  type        = string
}
