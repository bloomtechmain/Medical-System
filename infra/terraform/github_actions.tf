# Lets GitHub Actions deploy to staging without a stored AWS access key —
# the runner exchanges a short-lived OIDC token for credentials via this
# role instead. See .github/workflows/deploy.yml's header for the secrets/
# variables this role's ARN (the output below) needs to be copied into.
#
# A standalone root-level resource, same reasoning as security_group_rules.tf:
# this needs outputs from compute, data, edge AND iam, and none of those
# modules should have to depend on each other just to hand them to it.
#
# Only one AWS environment exists (staging) — production still deploys via
# Railway (docs/decisions/0002-railway-then-aws.md) — so this is one role,
# not a role per environment, and the OIDC provider is created unconditionally
# rather than guarded by a workspace check. Revisit both of those the day a
# second AWS environment actually exists.

data "aws_caller_identity" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # GitHub's own documented thumbprint for this provider. AWS also verifies
  # the certificate chain itself at request time regardless of this value,
  # so it's a required field more than a security boundary.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_actions_deploy" {
  name = "${var.environment}-github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # Two shapes because two jobs need this role: "build" (no
          # `environment:` block, so its sub claim is ref-based) and
          # "deploy-staging" (declares `environment: staging`, so GitHub
          # swaps the sub claim to the environment-based form instead).
          "token.actions.githubusercontent.com:sub" = [
            "repo:${var.github_repository}:ref:refs/heads/main",
            "repo:${var.github_repository}:environment:staging",
          ]
        }
      }
    }]
  })

  tags = { Name = "${var.environment}-github-actions-deploy" }
}

data "aws_iam_policy_document" "github_actions_deploy" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # AWS gives this action no resource-level permissions.
  }

  statement {
    sid = "EcrPushPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
    ]
    resources = [module.compute.ecr_repository_arn]
  }

  statement {
    sid       = "EcsTaskDefinitions"
    actions   = ["ecs:RegisterTaskDefinition", "ecs:DeregisterTaskDefinition", "ecs:DescribeTaskDefinition"]
    resources = ["*"] # Task definitions aren't addressable by ARN at request time for these actions.
  }

  statement {
    sid       = "EcsService"
    actions   = ["ecs:UpdateService", "ecs:DescribeServices"]
    resources = [module.compute.ecs_service_arn]
  }

  statement {
    sid       = "EcsTasks"
    actions   = ["ecs:DescribeTasks", "ecs:ListTasks"]
    resources = [module.compute.ecs_cluster_arn]
  }

  statement {
    # Exactly these two, not "*" — same discipline as the Secrets Manager
    # policy in modules/iam/main.tf. Needed because register-task-definition
    # passes both roles to the tasks it defines.
    sid       = "PassTaskRoles"
    actions   = ["iam:PassRole"]
    resources = [module.iam.ecs_task_execution_role_arn, module.iam.ecs_task_role_arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  statement {
    # CreateDBSnapshot needs authorization on BOTH the source DB instance AND
    # the snapshot resource it's about to create — the instance ARN alone
    # isn't enough, which is what the AccessDenied on the snapshot ARN was
    # about. Scoped to scripts/deploy/snapshot-database.sh's own naming
    # convention ("pre-migration-<environment>-<timestamp>") rather than
    # snapshot:* .
    sid     = "RdsSnapshot"
    actions = ["rds:CreateDBSnapshot", "rds:DescribeDBSnapshots"]
    resources = [
      module.data.db_instance_arn,
      "arn:aws:rds:${var.aws_region}:${data.aws_caller_identity.current.account_id}:snapshot:pre-migration-*",
    ]
  }

  statement {
    sid       = "FrontendBucketList"
    actions   = ["s3:ListBucket"]
    resources = [module.edge.frontend_bucket_arn]
  }

  statement {
    # Deliberately the frontend bucket only — never the uploads bucket.
    sid       = "FrontendBucketObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${module.edge.frontend_bucket_arn}/*"]
  }

  statement {
    sid       = "CloudfrontInvalidate"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [module.edge.cloudfront_distribution_arn]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name   = "${var.environment}-github-actions-deploy"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_deploy.json
}
