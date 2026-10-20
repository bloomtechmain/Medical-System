output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "private_compute_subnet_ids" {
  value = module.network.private_compute_subnet_ids
}

output "private_data_subnet_ids" {
  value = module.network.private_data_subnet_ids
}

output "nat_gateway_ids" {
  value = module.network.nat_gateway_ids
}

output "alb_dns_name" {
  description = "Point api.* at this via a Route 53 ALIAS record (not CNAME)."
  value       = module.compute.alb_dns_name
}

output "ecr_repository_url" {
  description = "Where CI pushes the Docker image."
  value       = module.compute.ecr_repository_url
}

output "db_endpoint" {
  value = module.data.db_endpoint
}

output "cloudfront_domain_name" {
  description = "Point app.* at this via Route 53 (or use it directly before a custom domain exists)."
  value       = module.edge.cloudfront_domain_name
}

output "frontend_bucket_name" {
  description = "Where the frontend deploy pipeline syncs the Vite build."
  value       = module.edge.frontend_bucket_name
}

output "ecs_service_name" {
  description = "Copy into the deploy workflow's ECS_SERVICE repo variable."
  value       = module.compute.ecs_service_name
}

output "db_instance_identifier" {
  description = "Copy into the deploy workflow's RDS_INSTANCE_IDENTIFIER repo variable."
  value       = module.data.db_instance_identifier
}

output "cloudfront_distribution_id" {
  description = "Copy into the deploy workflow's CLOUDFRONT_DISTRIBUTION_ID repo variable."
  value       = module.edge.cloudfront_distribution_id
}

output "github_actions_deploy_role_arn" {
  description = "Copy into the deploy workflow's AWS_ROLE_ARN repo secret. See github_actions.tf."
  value       = aws_iam_role.github_actions_deploy.arn
}
