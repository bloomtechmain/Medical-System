# Latest ECS-optimized AL2023 AMI, resolved via AWS's own published SSM
# parameter — never hand-pinned, so new instances always launch on a
# current, patched image. This is a data source: terraform validate doesn't
# evaluate it, but terraform plan/apply will need real AWS access to resolve
# it (unlike modules/network and modules/data, which used no data sources).
data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}

resource "aws_launch_template" "ecs" {
  name_prefix   = "${var.environment}-corehealth-ecs-"
  image_id      = data.aws_ssm_parameter.ecs_ami.value
  instance_type = var.instance_type

  iam_instance_profile {
    name = var.ec2_instance_profile_name
  }

  vpc_security_group_ids = [aws_security_group.ec2.id]

  # Registers the instance with the right ECS cluster on boot. No SSH key —
  # shell access is via SSM Session Manager only (granted by the instance
  # profile's AmazonSSMManagedInstanceCore attachment in modules/iam).
  user_data = base64encode(<<-EOF
    #!/bin/bash
    echo ECS_CLUSTER=${aws_ecs_cluster.this.name} >> /etc/ecs/ecs.config
  EOF
  )

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.environment}-corehealth-ecs-instance" }
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_autoscaling_group" "ecs" {
  name_prefix         = "${var.environment}-corehealth-ecs-"
  vpc_zone_identifier = values(var.private_compute_subnet_ids)
  min_size            = var.asg_min_size
  max_size            = var.asg_max_size
  # No desired_size set here deliberately — the ECS capacity provider's
  # managed scaling (ecs.tf) owns that number once attached, not the ASG.

  launch_template {
    id      = aws_launch_template.ecs.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${var.environment}-corehealth-ecs-instance"
    propagate_at_launch = true
  }
  tag {
    key                 = "AmazonECSManaged" # required by the ECS capacity provider
    value               = ""
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
  }
}
