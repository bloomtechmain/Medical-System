resource "aws_ecr_repository" "api" {
  name                 = "${var.environment}-corehealth-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "${var.environment}-corehealth-api" }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.environment}-corehealth-api"
  retention_in_days = 14

  tags = { Name = "${var.environment}-corehealth-api-logs" }
}

resource "aws_ecs_cluster" "this" {
  name = "${var.environment}-corehealth"

  tags = { Name = "${var.environment}-corehealth-cluster" }
}

resource "aws_ecs_capacity_provider" "this" {
  name = "${var.environment}-corehealth-cp"

  auto_scaling_group_provider {
    auto_scaling_group_arn = aws_autoscaling_group.ecs.arn

    managed_scaling {
      status                    = "ENABLED"
      target_capacity           = 80 # leave ~20% headroom before the ASG scales out
      minimum_scaling_step_size = 1
      maximum_scaling_step_size = 2
    }
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = [aws_ecs_capacity_provider.this.name]

  default_capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.this.name
    weight            = 1
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.environment}-corehealth-api"
  requires_compatibilities = ["EC2"]
  network_mode             = "bridge" # not awsvpc — avoids the ENI-per-task limit on EC2, see docs/architecture.md
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = var.ecs_task_role_arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:${var.container_image_tag}"
      essential = true
      cpu       = var.task_cpu
      memory    = var.task_memory_mb

      portMappings = [
        { containerPort = 5000, hostPort = 0, protocol = "tcp" } # hostPort 0 = dynamic, bridge mode
      ]

      environment = concat(
        [
          { name = "NODE_ENV", value = "production" },
          { name = "PORT", value = "5000" },
          { name = "DB_HOST", value = var.db_address },
          { name = "DB_PORT", value = "5432" },
          { name = "DB_NAME", value = var.db_name },
          { name = "CLIENT_URL", value = var.client_url },
          # RDS requires an encrypted connection (confirmed at apply time: a
          # plaintext connection gets "no pg_hba.conf entry ... no encryption").
          # REJECT_UNAUTHORIZED=false is a temporary gap, same category as the
          # self-signed ALB cert — fix by pinning the real RDS CA via DB_SSL_CA
          # before this holds production data.
          { name = "DB_SSL", value = "true" },
          { name = "DB_SSL_REJECT_UNAUTHORIZED", value = "false" },
          { name = "FEATURE_REQUIRE_EMAIL_VERIFICATION", value = tostring(var.feature_require_email_verification) },
          # REDIS_URL intentionally absent — no Redis module yet. Falls back
          # to Socket.IO's in-memory adapter (ARCH-05) until one exists.
        ],
        var.uploads_bucket_name != null ? [
          { name = "AWS_S3_BUCKET", value = var.uploads_bucket_name }
        ] : [],
        # Three-subdomain split (docs/decisions/0006-three-domain-split.md):
        # CLIENT_URL above stays the site zone (email links); app./dashboard.
        # need CORS too, which is all this additive var is for.
        var.extra_cors_origins != null ? [
          { name = "EXTRA_CORS_ORIGINS", value = var.extra_cors_origins }
        ] : []
      )

      # Pulled directly from Secrets Manager by ECS itself at task start —
      # never pass through Terraform state as plaintext, never typed by a
      # human. DB_USER/DB_PASSWORD read individual JSON keys out of the
      # RDS-managed secret (AWS's native pattern for this).
      secrets = [
        { name = "DB_USER", valueFrom = "${var.db_secret_arn}:username::" },
        { name = "DB_PASSWORD", valueFrom = "${var.db_secret_arn}:password::" },
        { name = "JWT_SECRET", valueFrom = var.jwt_secret_arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])

  tags = { Name = "${var.environment}-corehealth-api-task" }
}

data "aws_region" "current" {}

resource "aws_ecs_service" "api" {
  name            = "${var.environment}-corehealth-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.this.name
    weight            = 1
  }

  # Rolling deploy — minimum 50% of capacity stays up throughout, so a
  # deploy never drops the API to zero (see docs/architecture.md §2).
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 5000
  }

  depends_on = [aws_lb_listener.https]
}
