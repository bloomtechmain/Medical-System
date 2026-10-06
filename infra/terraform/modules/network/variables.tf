variable "environment" {
  description = "Environment name, for resource naming/tagging."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC — subnets are carved out of this with cidrsubnet()."
  type        = string
}

variable "azs" {
  description = "Exactly 2 Availability Zones to spread subnets across."
  type        = list(string)
}

variable "single_nat_gateway" {
  description = "true = one shared NAT Gateway in azs[0]. false = one per AZ."
  type        = bool
}
