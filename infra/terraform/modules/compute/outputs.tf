output "alb_dns_name" {
  description = "Route 53's api.* record points here."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "For a Route 53 ALIAS record (not a plain CNAME)."
  value       = aws_lb.this.zone_id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ec2_security_group_id" {
  description = "Wire this into modules/data's allowed_security_group_ids once both exist in the same root apply."
  value       = aws_security_group.ec2.id
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "ecr_repository_arn" {
  description = "For scoping the CI deploy role's ECR push/pull policy to exactly this repo."
  value       = aws_ecr_repository.api.arn
}

output "ecs_cluster_arn" {
  description = "For scoping the CI deploy role's ecs:DescribeServices/ListTasks policy."
  value       = aws_ecs_cluster.this.arn
}

output "ecs_service_name" {
  value = aws_ecs_service.api.name
}

output "ecs_service_arn" {
  description = "aws_ecs_service's id is the service ARN on provider v5 — for scoping the CI deploy role's ecs:UpdateService policy."
  value       = aws_ecs_service.api.id
}
