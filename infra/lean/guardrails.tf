# Budget guardrails for the owner's hard $46.40/month ceiling.
#
# AWS cannot refuse to bill past an amount — it bills after the fact. So:
#   1. Email at 50% / 80% / 100% of actual spend and 100% of forecast.
#   2. At 100% of ACTUAL spend, AWS Budgets automatically STOPS the server
#      and the database. The site goes offline rather than over budget.
#      (Start them again from the console once the cause is understood. A
#      stopped RDS instance restarts by itself after 7 days — AWS rule.)
#   3. Cost Anomaly Detection: an email if any service starts costing money
#      it normally doesn't.
#   4. Health alarms (8 of the 10 free CloudWatch alarms) to the same email.
# All of this is free.

resource "aws_budgets_budget" "monthly" {
  name         = "suwela-monthly-cap"
  budget_type  = "COST"
  limit_amount = var.budget_limit_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.budget_alert_email]
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}

data "aws_iam_policy_document" "budgets_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "budget_action" {
  name               = "suwela-budget-action"
  assume_role_policy = data.aws_iam_policy_document.budgets_assume.json
}

resource "aws_iam_role_policy" "budget_action" {
  name = "stop-server-and-database"
  role = aws_iam_role.budget_action.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:StartAutomationExecution", "ssm:GetAutomationExecution"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ec2:StopInstances", "ec2:DescribeInstances", "ec2:DescribeInstanceStatus"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["rds:StopDBInstance", "rds:DescribeDBInstances"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = aws_iam_role.budget_action.arn
      },
    ]
  })
}

resource "aws_budgets_budget_action" "stop_ec2" {
  budget_name        = aws_budgets_budget.monthly.name
  action_type        = "RUN_SSM_DOCUMENTS"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budget_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    ssm_action_definition {
      action_sub_type = "STOP_EC2_INSTANCES"
      region          = var.aws_region
      instance_ids    = [aws_instance.app.id]
    }
  }

  subscriber {
    address           = var.budget_alert_email
    subscription_type = "EMAIL"
  }
}

resource "aws_budgets_budget_action" "stop_rds" {
  budget_name        = aws_budgets_budget.monthly.name
  action_type        = "RUN_SSM_DOCUMENTS"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budget_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    ssm_action_definition {
      action_sub_type = "STOP_RDS_INSTANCES"
      region          = var.aws_region
      instance_ids    = [aws_db_instance.main.identifier]
    }
  }

  subscriber {
    address           = var.budget_alert_email
    subscription_type = "EMAIL"
  }
}

resource "aws_ce_anomaly_monitor" "services" {
  name              = "suwela-services"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_subscription" "email" {
  name             = "suwela-cost-anomalies"
  frequency        = "DAILY"
  monitor_arn_list = [aws_ce_anomaly_monitor.services.arn]

  subscriber {
    type    = "EMAIL"
    address = var.budget_alert_email
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = ["3"]
    }
  }
}

# ── Health alarms → email ────────────────────────────────────────────────────

resource "aws_sns_topic" "alerts" {
  name = "suwela-prod-alerts"
}

# AWS emails a confirmation link once; alerts only arrive after it is clicked.
resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.budget_alert_email
}

locals {
  alarms = {
    server-down = {
      namespace = "AWS/EC2", metric = "StatusCheckFailed", stat = "Maximum", op = "GreaterThanThreshold", threshold = 0, periods = 2,
      dims      = { InstanceId = aws_instance.app.id }, desc = "The API server failed a health check"
    }
    server-cpu = {
      namespace = "AWS/EC2", metric = "CPUUtilization", stat = "Average", op = "GreaterThanThreshold", threshold = 80, periods = 3,
      dims      = { InstanceId = aws_instance.app.id }, desc = "Server CPU above 80% for 15 minutes"
    }
    server-cpu-credits = {
      namespace = "AWS/EC2", metric = "CPUCreditBalance", stat = "Minimum", op = "LessThanThreshold", threshold = 20, periods = 3,
      dims      = { InstanceId = aws_instance.app.id }, desc = "Server almost out of CPU credits: it will be slowed to baseline (time to consider t3.medium)"
    }
    api-memory = {
      namespace = "AWS/ECS", metric = "MemoryUtilization", stat = "Average", op = "GreaterThanThreshold", threshold = 90, periods = 3,
      dims      = { ClusterName = aws_ecs_cluster.main.name, ServiceName = aws_ecs_service.api.name }, desc = "API memory above 90% of its reservation"
    }
    db-cpu = {
      namespace = "AWS/RDS", metric = "CPUUtilization", stat = "Average", op = "GreaterThanThreshold", threshold = 70, periods = 3,
      dims      = { DBInstanceIdentifier = aws_db_instance.main.identifier }, desc = "Database CPU above 70% for 15 minutes"
    }
    db-storage = {
      namespace = "AWS/RDS", metric = "FreeStorageSpace", stat = "Minimum", op = "LessThanThreshold", threshold = 3221225472, periods = 1,
      dims      = { DBInstanceIdentifier = aws_db_instance.main.identifier }, desc = "Database has less than 3 GB free"
    }
    db-memory = {
      namespace = "AWS/RDS", metric = "FreeableMemory", stat = "Minimum", op = "LessThanThreshold", threshold = 104857600, periods = 3,
      dims      = { DBInstanceIdentifier = aws_db_instance.main.identifier }, desc = "Database has less than 100 MB free memory"
    }
    db-connections = {
      namespace = "AWS/RDS", metric = "DatabaseConnections", stat = "Maximum", op = "GreaterThanThreshold", threshold = 60, periods = 2,
      dims      = { DBInstanceIdentifier = aws_db_instance.main.identifier }, desc = "More than 60 database connections"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "health" {
  for_each            = local.alarms
  alarm_name          = "suwela-${each.key}"
  alarm_description   = each.value.desc
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.stat
  comparison_operator = each.value.op
  threshold           = each.value.threshold
  period              = 300
  evaluation_periods  = each.value.periods
  dimensions          = each.value.dims
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
