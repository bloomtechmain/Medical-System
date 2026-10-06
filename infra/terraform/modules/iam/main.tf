# Four roles, each scoped to exactly what it needs — see docs/architecture
# diagram's §2 table ("why it matters" column) for the reasoning behind
# keeping these this narrow instead of one broad role.

# ---- EC2 instance role: lets an instance join the ECS cluster + be
# reachable via SSM Session Manager. No SSH key, no open port 22. ----------

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2_instance" {
  name               = "${var.environment}-ec2-instance-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "ec2_ecs" {
  role       = aws_iam_role.ec2_instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_instance" {
  name = "${var.environment}-ec2-instance-profile"
  role = aws_iam_role.ec2_instance.name
}

# ---- ECS task execution role: what ECS itself needs (pull from ECR, write
# logs, read the two secrets below) — NOT what the app code can do. --------

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${var.environment}-ecs-task-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "ecs_task_execution_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.db_secret_arn, var.jwt_secret_arn] # exactly these two, not "*"
  }
}

resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name   = "${var.environment}-ecs-task-execution-secrets"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.ecs_task_execution_secrets.json
}

# ---- ECS task role: what the APP CODE itself can do, separate from what
# ECS needs. Scoped S3 read/write on exactly the uploads bucket, nothing
# else — the app can't touch the frontend bucket, any other project's
# resources, or anything outside this one bucket (ARCH-06). -----

resource "aws_iam_role" "ecs_task" {
  name               = "${var.environment}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "ecs_task_s3" {
  count = var.uploads_bucket_arn != null ? 1 : 0

  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.uploads_bucket_arn}/*"]
  }
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  count  = var.uploads_bucket_arn != null ? 1 : 0
  name   = "${var.environment}-ecs-task-s3-uploads"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task_s3[0].json
}
