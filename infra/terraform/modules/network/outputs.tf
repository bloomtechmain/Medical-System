output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Keyed by AZ — ALB goes here."
  value       = { for az, s in aws_subnet.public : az => s.id }
}

output "private_compute_subnet_ids" {
  description = "Keyed by AZ — EC2/ECS instances go here."
  value       = { for az, s in aws_subnet.private_compute : az => s.id }
}

output "private_data_subnet_ids" {
  description = "Keyed by AZ — RDS subnet group goes here."
  value       = { for az, s in aws_subnet.private_data : az => s.id }
}

output "nat_gateway_ids" {
  value = { for az, n in aws_nat_gateway.this : az => n.id }
}
