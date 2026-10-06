module "network" {
  source = "./modules/network"

  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  azs                = var.azs
  single_nat_gateway = var.single_nat_gateway
}

module "data" {
  source = "./modules/data"

  environment             = var.environment
  vpc_id                  = module.network.vpc_id
  private_data_subnet_ids = module.network.private_data_subnet_ids
  # No compute module yet — empty for now, wired in once modules/compute exists.
  allowed_security_group_ids = []

  instance_class      = var.db_instance_class
  multi_az            = var.db_multi_az
  deletion_protection = var.db_deletion_protection
  skip_final_snapshot = var.db_skip_final_snapshot
}
