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
  # Left empty deliberately, even though modules/compute exists now — wiring
  # module.compute's output in here would make data depend on compute while
  # compute also depends on data's outputs below, a genuine cycle. Broken
  # instead via the standalone aws_security_group_rule in
  # security_group_rules.tf, which depends on both without either module
  # depending on the other.
  allowed_security_group_ids = []

  instance_class      = var.db_instance_class
  multi_az            = var.db_multi_az
  deletion_protection = var.db_deletion_protection
  skip_final_snapshot = var.db_skip_final_snapshot
}

module "edge" {
  source = "./modules/edge"

  environment         = var.environment
  domain_name         = var.domain_name
  hosted_zone_id      = var.hosted_zone_id
  acm_certificate_arn = var.cloudfront_acm_certificate_arn
}

module "iam" {
  source = "./modules/iam"

  environment        = var.environment
  db_secret_arn      = module.data.master_user_secret_arn
  jwt_secret_arn     = aws_secretsmanager_secret.jwt.arn
  uploads_bucket_arn = module.edge.uploads_bucket_arn
}

module "compute" {
  source = "./modules/compute"

  environment                = var.environment
  vpc_id                     = module.network.vpc_id
  public_subnet_ids          = module.network.public_subnet_ids
  private_compute_subnet_ids = module.network.private_compute_subnet_ids

  instance_type = var.compute_instance_type
  asg_min_size  = var.compute_asg_min_size
  asg_max_size  = var.compute_asg_max_size
  desired_count = var.compute_desired_count

  ec2_instance_profile_name   = module.iam.ec2_instance_profile_name
  ecs_task_execution_role_arn = module.iam.ecs_task_execution_role_arn
  ecs_task_role_arn           = module.iam.ecs_task_role_arn

  rds_security_group_id = module.data.rds_security_group_id
  db_address            = module.data.db_address
  db_secret_arn         = module.data.master_user_secret_arn
  jwt_secret_arn        = aws_secretsmanager_secret.jwt.arn
  uploads_bucket_name   = module.edge.uploads_bucket_name

  # Auto-derived from modules/edge — a custom domain if one's configured,
  # otherwise CloudFront's own default URL. No manual "fill this in later"
  # step needed (unlike alb_acm_certificate_arn below, which genuinely can't
  # be automated — it has to be requested in the AWS account first).
  client_url = var.domain_name != null ? "https://${var.domain_name}" : "https://${module.edge.cloudfront_domain_name}"

  acm_certificate_arn = var.alb_acm_certificate_arn
}
