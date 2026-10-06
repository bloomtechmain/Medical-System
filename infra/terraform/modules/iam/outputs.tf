output "ec2_instance_profile_name" {
  value = aws_iam_instance_profile.ec2_instance.name
}

output "ecs_task_execution_role_arn" {
  value = aws_iam_role.ecs_task_execution.arn
}

output "ecs_task_role_arn" {
  value = aws_iam_role.ecs_task.arn
}

output "ecs_task_role_name" {
  description = "For attaching the S3 policy later, once modules/edge exists."
  value       = aws_iam_role.ecs_task.name
}
