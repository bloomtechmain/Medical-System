variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  description = "Keyed by AZ — ALB goes here."
  type        = map(string)
}

variable "private_compute_subnet_ids" {
  description = "Keyed by AZ — EC2/ECS instances go here."
  type        = map(string)
}

variable "instance_type" {
  description = "e.g. t3.small — see the AWS architecture doc's cost reasoning (EC2 over Fargate, bin-packed, Reserved-Instance-eligible)."
  type        = string
  default     = "t3.small"
}

variable "asg_min_size" {
  description = "Floor of 2 is deliberate, not arbitrary — one instance per AZ for redundancy, not raw capacity (see docs/capacity-plan.md)."
  type        = number
  default     = 2
}

variable "asg_max_size" {
  type    = number
  default = 4
}

variable "task_cpu" {
  description = "Of the 2048 units a t3.small provides — leaves headroom for the ECS agent + OS."
  type        = number
  default     = 512
}

variable "task_memory_mb" {
  description = "Of the ~2GB a t3.small provides — leaves headroom for the ECS agent + OS."
  type        = number
  default     = 900
}

variable "desired_count" {
  description = "ECS service desired task count. Matches asg_min_size in the common case (one task per instance)."
  type        = number
  default     = 2
}

variable "ec2_instance_profile_name" {
  description = "From modules/iam."
  type        = string
}

variable "ecs_task_execution_role_arn" {
  description = "From modules/iam."
  type        = string
}

variable "ecs_task_role_arn" {
  description = "From modules/iam."
  type        = string
}

variable "rds_security_group_id" {
  description = "From modules/data — sg-ec2 gets an egress rule to reach it on 5432."
  type        = string
}

variable "db_address" {
  description = "From modules/data's db_address output."
  type        = string
}

variable "db_name" {
  type    = string
  default = "corehealth"
}

variable "db_username" {
  type    = string
  default = "corehealth_app"
}

variable "db_secret_arn" {
  description = "RDS-managed master-user secret ARN — the task definition reads the username/password keys directly from this via ECS's native Secrets Manager JSON-key support, never through Terraform."
  type        = string
}

variable "jwt_secret_arn" {
  type = string
}

variable "client_url" {
  description = "The frontend's public URL (CloudFront, once modules/edge exists) — required by the server's ARCH-04 production CORS check. No default: must be supplied once that exists."
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM cert for the ALB's 443 listener, issued in this same region (NOT the CloudFront one, which must be us-east-1 — see docs/architecture.md). No default: must be requested and supplied before this module can actually apply."
  type        = string
}

variable "container_image_tag" {
  description = "Tag to deploy from this module's own ECR repo (e.g. \"latest\" locally, a commit SHA from CI in practice). The repo itself is created by this module (ecr.tf) — nothing external to reference."
  type        = string
  default     = "latest"
}
