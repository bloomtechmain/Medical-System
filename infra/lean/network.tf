# One VPC, no NAT gateway (the old design's single biggest cost).
#
#   public subnet  (AZ a)     → the one EC2 server, with an Elastic IP
#   private subnets (AZ a, b) → RDS only. No route to the internet at all;
#                               RDS needs two AZs in its subnet group even
#                               when it runs in one.

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  az_a = data.aws_availability_zones.available.names[0]
  az_b = data.aws_availability_zones.available.names[1]
}

resource "aws_vpc" "main" {
  cidr_block           = "10.40.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "suwela-prod" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "suwela-prod" }
}

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.40.1.0/24"
  availability_zone       = local.az_a
  map_public_ip_on_launch = false # the server gets its Elastic IP; nothing else gets a (billed) public IP
  tags                    = { Name = "suwela-prod-public-a" }
}

resource "aws_subnet" "db_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.40.11.0/24"
  availability_zone = local.az_a
  tags              = { Name = "suwela-prod-db-a" }
}

resource "aws_subnet" "db_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.40.12.0/24"
  availability_zone = local.az_b
  tags              = { Name = "suwela-prod-db-b" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "suwela-prod-public" }
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

# The DB subnets use the VPC's main route table: local traffic only.

# S3 gateway endpoint: free, and keeps upload traffic between the server and
# S3 off the public internet.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id]
  tags              = { Name = "suwela-prod-s3" }
}

# ── Security groups ──────────────────────────────────────────────────────────

resource "aws_security_group" "app" {
  name        = "suwela-prod-app"
  description = "API server: HTTPS from Cloudflare only. No SSH (use SSM Session Manager)."
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "suwela-prod-app" }
}

resource "aws_vpc_security_group_ingress_rule" "https_from_cloudflare" {
  for_each          = toset(var.cloudflare_ipv4_ranges)
  security_group_id = aws_security_group.app.id
  description       = "Cloudflare"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = each.value
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "db" {
  name        = "suwela-prod-db"
  description = "PostgreSQL from the API server only"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "suwela-prod-db" }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.app.id
}
