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
