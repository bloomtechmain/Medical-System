# VPC layout matches docs/architecture.md and the AWS deployment doc shared
# earlier: 2 AZs × 3 subnet tiers (public / private-compute / private-data).
# CIDR math: public = .0/.1, private-compute = .10/.11, private-data = .20/.21
# within whichever /16 this environment's vpc_cidr is.

locals {
  az_index = { for idx, az in var.azs : az => idx }

  # Single shared NAT (cost-conscious default) vs. one per AZ (full
  # redundancy) — see docs/single-points-of-failure.md for the tradeoff.
  nat_azs = var.single_nat_gateway ? [var.azs[0]] : var.azs

  nat_gateway_id_for_az = {
    for az in var.azs :
    az => var.single_nat_gateway ? aws_nat_gateway.this[var.azs[0]].id : aws_nat_gateway.this[az].id
  }
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.environment}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = { Name = "${var.environment}-igw" }
}

# ---- subnets ----------------------------------------------------------

resource "aws_subnet" "public" {
  for_each                = local.az_index
  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.key
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, each.value)
  map_public_ip_on_launch = true

  tags = { Name = "${var.environment}-public-${each.key}", Tier = "public" }
}

resource "aws_subnet" "private_compute" {
  for_each          = local.az_index
  vpc_id            = aws_vpc.this.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value + 10)

  tags = { Name = "${var.environment}-private-compute-${each.key}", Tier = "private-compute" }
}

resource "aws_subnet" "private_data" {
  for_each          = local.az_index
  vpc_id            = aws_vpc.this.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value + 20)

  tags = { Name = "${var.environment}-private-data-${each.key}", Tier = "private-data" }
}

# ---- public routing: subnets -> IGW ------------------------------------

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.environment}-public-rt" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  for_each       = local.az_index
  subnet_id      = aws_subnet.public[each.key].id
  route_table_id = aws_route_table.public.id
}

# ---- NAT: lets private-compute reach the internet (ECR pulls, Secrets
# Manager, CloudWatch) without being reachable from it ------------------

resource "aws_eip" "nat" {
  for_each = toset(local.nat_azs)
  domain   = "vpc"
  tags     = { Name = "${var.environment}-nat-eip-${each.key}" }
}

resource "aws_nat_gateway" "this" {
  for_each      = toset(local.nat_azs)
  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = aws_subnet.public[each.key].id

  tags       = { Name = "${var.environment}-nat-${each.key}" }
  depends_on = [aws_internet_gateway.this]
}

# ---- private-compute routing: subnets -> NAT ---------------------------

resource "aws_route_table" "private_compute" {
  for_each = local.az_index
  vpc_id   = aws_vpc.this.id
  tags     = { Name = "${var.environment}-private-compute-rt-${each.key}" }
}

resource "aws_route" "private_compute_nat" {
  for_each               = local.az_index
  route_table_id         = aws_route_table.private_compute[each.key].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = local.nat_gateway_id_for_az[each.key]
}

resource "aws_route_table_association" "private_compute" {
  for_each       = local.az_index
  subnet_id      = aws_subnet.private_compute[each.key].id
  route_table_id = aws_route_table.private_compute[each.key].id
}

# ---- private-data routing: NO internet route, intentionally -----------
# RDS doesn't need outbound internet. Giving it none (not even via NAT) is
# a free hardening step, not a gap — see docs/single-points-of-failure.md.

resource "aws_route_table" "private_data" {
  for_each = local.az_index
  vpc_id   = aws_vpc.this.id
  tags     = { Name = "${var.environment}-private-data-rt-${each.key}" }
}

resource "aws_route_table_association" "private_data" {
  for_each       = local.az_index
  subnet_id      = aws_subnet.private_data[each.key].id
  route_table_id = aws_route_table.private_data[each.key].id
}
