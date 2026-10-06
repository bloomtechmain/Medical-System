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
