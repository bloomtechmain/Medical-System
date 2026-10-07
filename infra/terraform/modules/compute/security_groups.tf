# Chain: internet -> sg-alb -> sg-ec2 -> sg-rds. Each only opens the door to
# the one directly before it — see docs/architecture.md §4's reasoning.

resource "aws_security_group" "alb" {
  name_prefix = "${var.environment}-sg-alb-"
  description = "Internet-facing ALB — the one thing in this whole stack reachable from 0.0.0.0/0."
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP - redirected to HTTPS by the listener, not served directly"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.environment}-sg-alb" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "ec2" {
  name_prefix = "${var.environment}-sg-ec2-"
  description = "ECS (EC2 launch type) instances — reachable only from the ALB, on the dynamic port range bridge-mode tasks use."
  vpc_id      = var.vpc_id

  tags = { Name = "${var.environment}-sg-ec2" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "ec2_from_alb" {
  type                     = "ingress"
  from_port                = 32768 # ECS bridge-mode dynamic port range (ephemeral port default)
  to_port                  = 65535
  protocol                 = "tcp"
  security_group_id        = aws_security_group.ec2.id
  source_security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_to_ec2" {
  type                     = "egress"
  from_port                = 32768
  to_port                  = 65535
  protocol                 = "tcp"
  security_group_id        = aws_security_group.alb.id
  source_security_group_id = aws_security_group.ec2.id
}

resource "aws_security_group_rule" "ec2_to_rds" {
  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.ec2.id
  source_security_group_id = var.rds_security_group_id
}

resource "aws_security_group_rule" "ec2_to_internet" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  security_group_id = aws_security_group.ec2.id
  cidr_blocks       = ["0.0.0.0/0"] # via the NAT Gateway — ECR pulls, Secrets Manager, CloudWatch
  description       = "Outbound only - nothing initiates a connection in from here"
}
