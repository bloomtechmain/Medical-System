variable "environment" {
  description = "Environment name, for resource naming/tagging."
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "private_data_subnet_ids" {
  description = "From the network module's private_data_subnet_ids output (keyed by AZ) — RDS lives here, nowhere else."
  type        = map(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to reach Postgres on 5432 — i.e. the compute module's EC2/ECS security group. Empty list for now (no compute module built yet); wire this in once it exists. See docs/architecture.md's security-group-chain reasoning."
  type        = list(string)
  default     = []
}

variable "instance_class" {
  description = "e.g. db.t4g.small (production) or db.t4g.micro (staging) — Graviton, matches the AWS architecture doc's cost reasoning."
  type        = string
}

variable "multi_az" {
  description = "false = Single-AZ (cost-conscious default, see docs/single-points-of-failure.md). true = automatic failover standby, roughly doubles the RDS cost."
  type        = bool
  default     = false
}

variable "allocated_storage_gb" {
  type    = number
  default = 20
}

variable "max_allocated_storage_gb" {
  description = "Storage autoscaling ceiling."
  type        = number
  default     = 100
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  description = "true for production (prevents an accidental terraform destroy / console delete). false for staging, so it can be torn down freely."
  type        = bool
}

variable "skip_final_snapshot" {
  description = "false for production (always snapshot on destroy). true for staging (don't bother)."
  type        = bool
}

variable "db_name" {
  type    = string
  default = "corehealth"
}

variable "db_username" {
  description = "Master username. The password is NOT a Terraform variable — see main.tf's manage_master_user_password."
  type        = string
  default     = "corehealth_app"
}
