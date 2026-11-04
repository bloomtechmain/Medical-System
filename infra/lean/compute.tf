# One t3.small running ECS. The task has two containers on the host network:
#   api   — the Node server on 127.0.0.1:5000 (never exposed: the firewall
#           only opens 443)
#   https — Caddy on :443 with the Cloudflare Origin CA certificate,
#           proxying to the api. Replaces the load balancer (~$20/month).

data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}

data "aws_caller_identity" "current" {}

resource "aws_ecr_repository" "api" {
  name                 = "suwela-prod-api"
  image_tag_mutability = "MUTABLE"
  force_delete         = false
  image_scanning_configuration { scan_on_push = true }
}

# Keep 3 images (~$0.10/month); older ones are deleted automatically.
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 3 most recent images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 3 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/suwela-prod-api"
  retention_in_days = 7
}

resource "aws_ecs_cluster" "main" {
  name = "suwela-prod"
  setting {
    name  = "containerInsights"
    value = "disabled" # Container Insights is billed per metric
  }
}

# ── IAM ──────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "suwela-prod-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "instance_ecs" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

# SSM Session Manager instead of SSH (no port 22, no keys to lose).
resource "aws_iam_role_policy_attachment" "instance_ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name = "suwela-prod-instance"
  role = aws_iam_role.instance.name
}

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: pulls the image, writes logs, injects the SSM secrets.
resource "aws_iam_role" "task_execution" {
  name               = "suwela-prod-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "task_execution_ssm" {
  name = "read-suwela-parameters"
  role = aws_iam_role.task_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameters", "ssm:GetParameter"]
      Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/suwela/prod/*"
    }]
  })
}

# Task role: what the app itself may do — its uploads bucket, nothing else.
resource "aws_iam_role" "task" {
  name               = "suwela-prod-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy" "task_uploads" {
  name = "uploads-bucket"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.uploads.arn },
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.uploads.arn}/*" },
    ]
  })
}

# ── The server ───────────────────────────────────────────────────────────────

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.ecs_ami.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public_a.id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name

  # Standard credits: CPU is throttled to the baseline when credits run out
  # instead of being billed for "unlimited" bursting — the budget never moves.
  credit_specification { cpu_credits = "standard" }

  # AWS moves the instance to healthy hardware by itself if the host fails.
  maintenance_options { auto_recovery = "default" }

  metadata_options {
    http_tokens                 = "required" # IMDSv2 only
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 30
    encrypted             = true
    delete_on_termination = true
  }

  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail
    echo "ECS_CLUSTER=${aws_ecs_cluster.main.name}" >> /etc/ecs/ecs.config
    echo "ECS_ENABLE_CONTAINER_METADATA=true" >> /etc/ecs/ecs.config
    # 2 GB swap: a safety net for report reading (OCR) spikes on a 2 GB host.
    if [ ! -f /swapfile ]; then
      dd if=/dev/zero of=/swapfile bs=1M count=2048
      chmod 600 /swapfile
      mkswap /swapfile
    fi
    swapon /swapfile || true
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl -w vm.swappiness=10
  EOT

  lifecycle {
    # A newer ECS AMI must not silently replace the production server.
    ignore_changes = [ami, user_data]
  }

  tags = { Name = "suwela-prod-app" }
}

# A fixed address for Cloudflare's api.suwela.com record (an auto-assigned IP
# would change whenever the server stops). AWS bills every public IPv4 at
# $3.65/month — this is the only one in the account, already in the budget.
resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id
  tags     = { Name = "suwela-prod-api" }
}

# ── Task & service ───────────────────────────────────────────────────────────

locals {
  web_bucket_host = "${aws_s3_bucket.frontend.bucket}.s3.${var.aws_region}.amazonaws.com"

  # The HTTPS proxy (Caddy). One certificate (Cloudflare Origin CA,
  # suwela.com + *.suwela.com) for every name:
  #   suwela.com               → 301 to https://www.suwela.com (same path)
  #   api.suwela.com           → the Node API on 127.0.0.1:5000
  #   www/app/dashboard/admin  → the website files in S3, fetched through the
  #                              VPC's S3 endpoint (the bucket only allows
  #                              that endpoint). Unknown paths fall back to
  #                              index.html so the app's router takes over.
  # Cloudflare caches the static files in front of this.
  caddyfile = <<-EOT
    {
    	auto_https off
    	admin off
    }
    :443 {
    	tls /tmp/origin.pem /tmp/origin.key
    	encode gzip

    	# Bare suwela.com → www, keeping the path (suwela.com/login → www.suwela.com/login).
    	@apex host ${var.root_domain}
    	redir @apex https://${var.site_host}{uri} 301

    	@api host ${var.api_host}
    	handle @api {
    		reverse_proxy 127.0.0.1:5000
    	}

    	handle {
    		header {
    			Strict-Transport-Security "max-age=31536000; includeSubDomains"
    			X-Content-Type-Options nosniff
    			X-Frame-Options SAMEORIGIN
    			Referrer-Policy strict-origin-when-cross-origin
    			-Server
    		}
    		@root path /
    		rewrite @root /index.html
    		reverse_proxy https://${local.web_bucket_host} {
    			header_up Host ${local.web_bucket_host}
    			header_down -x-amz-request-id
    			header_down -x-amz-id-2
    			@missing status 403 404
    			handle_response @missing {
    				rewrite * /index.html
    				reverse_proxy https://${local.web_bucket_host} {
    					header_up Host ${local.web_bucket_host}
    				}
    			}
    		}
    	}
    }
  EOT

  caddy_start = join(" && ", [
    "printf '%s' \"$ORIGIN_CERT\" > /tmp/origin.pem",
    "printf '%s' \"$ORIGIN_KEY\" > /tmp/origin.key",
    "printf '%s' \"$CADDYFILE\" > /tmp/Caddyfile",
    "exec caddy run --config /tmp/Caddyfile --adapter caddyfile",
  ])
}

locals {
  mail_enabled = trimspace(var.smtp_host) != ""
}

resource "aws_ecs_task_definition" "api" {
  family                   = "suwela-prod-api"
  requires_compatibilities = ["EC2"]
  network_mode             = "host"
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      # Must stay first: CI swaps containerDefinitions[0].image on deploy.
      name              = "api"
      image             = "${aws_ecr_repository.api.repository_url}:${var.container_image_tag}"
      essential         = true
      memoryReservation = 1024
      memory            = 1700

      environment = concat([
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "5000" },
        { name = "DB_HOST", value = aws_db_instance.main.address },
        { name = "DB_PORT", value = "5432" },
        { name = "DB_NAME", value = aws_db_instance.main.db_name },
        { name = "DB_SSL", value = "true" },
        { name = "DB_SSL_REJECT_UNAUTHORIZED", value = "false" },
        { name = "CLIENT_URL", value = "https://${var.site_host}" },
        { name = "EXTRA_CORS_ORIGINS", value = "https://${var.app_host},https://${var.dashboard_host},https://${var.admin_host}" },
        { name = "AWS_S3_BUCKET", value = aws_s3_bucket.uploads.bucket },
        { name = "AWS_REGION", value = var.aws_region },
        # Cloudflare → Caddy → api: two proxies, so the client's real IP is
        # two hops back (rate limits must key on the user, not Cloudflare).
        { name = "TRUST_PROXY_HOPS", value = "2" },
        # No mail path = no codes can arrive, so verification is forced off
        # (the API also refuses to start with it on and no SMTP).
        { name = "FEATURE_REQUIRE_EMAIL_VERIFICATION", value = tostring(local.mail_enabled && var.feature_require_email_verification) },
        { name = "GOOGLE_CLIENT_ID", value = var.google_client_id },
        ], local.mail_enabled ? [
        { name = "SMTP_HOST", value = var.smtp_host },
        { name = "SMTP_PORT", value = tostring(var.smtp_port) },
        { name = "SMTP_SECURE", value = tostring(var.smtp_secure) },
        { name = "SMTP_FROM", value = var.smtp_from },
      ] : [])

      secrets = concat([
        { name = "DB_USER", valueFrom = aws_ssm_parameter.db_username.arn },
        { name = "DB_PASSWORD", valueFrom = aws_ssm_parameter.db_password.arn },
        { name = "JWT_SECRET", valueFrom = aws_ssm_parameter.jwt_secret.arn },
        ], local.mail_enabled ? [
        { name = "SMTP_USER", valueFrom = aws_ssm_parameter.smtp_user.arn },
        { name = "SMTP_PASSWORD", valueFrom = aws_ssm_parameter.smtp_password.arn },
      ] : [])

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }
    },
    {
      name              = "https"
      image             = "public.ecr.aws/docker/library/caddy:2-alpine"
      essential         = false
      memoryReservation = 48
      restartPolicy     = { enabled = true }
      entryPoint        = ["sh", "-c"]
      command           = [local.caddy_start]
      environment       = [{ name = "CADDYFILE", value = local.caddyfile }]
      secrets = [
        { name = "ORIGIN_CERT", valueFrom = aws_ssm_parameter.origin_cert.arn },
        { name = "ORIGIN_KEY", valueFrom = aws_ssm_parameter.origin_key.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "https"
        }
      }
    },
  ])
}

resource "aws_ecs_service" "api" {
  name            = "suwela-prod-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 1
  launch_type     = "EC2"

  # One host, fixed ports: the old task has to stop before the new one starts
  # (this is the ~30–60 s of downtime per deploy in the plan).
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  deployment_circuit_breaker {
    enable   = true
    rollback = true # a deploy that never gets healthy rolls back to the last good one
  }

  lifecycle {
    # CI registers new task definitions on every deploy.
    ignore_changes = [task_definition]
  }
}
