# Cross-module security group rules live here, not inside either module —
# see main.tf's comment on module.data for why (avoids a dependency cycle
# between modules/data and modules/compute).

resource "aws_security_group_rule" "rds_from_ec2" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = module.data.rds_security_group_id
  source_security_group_id = module.compute.ec2_security_group_id
}
