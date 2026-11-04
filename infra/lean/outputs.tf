output "api_server_ip" {
  description = "Cloudflare: A record api.suwela.com → this IP (Proxied)."
  value       = aws_eip.app.public_ip
}

output "cloudfront_domain" {
  description = "Only when enable_cloudfront = true: Cloudflare CNAMEs for the web hosts point here."
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.web[0].domain_name : null
}

output "acm_validation_records" {
  description = "Cloudflare: add each as a CNAME, DNS only (grey cloud), to issue the website certificate."
  value = [for o in aws_acm_certificate.web.domain_validation_options : {
    name  = o.resource_record_name
    type  = o.resource_record_type
    value = o.resource_record_value
  }]
}

output "github_deploy_role_arn" { value = aws_iam_role.github_deploy.arn }
output "ecr_repository_url" { value = aws_ecr_repository.api.repository_url }
output "ecs_cluster_name" { value = aws_ecs_cluster.main.name }
output "ecs_service_name" { value = aws_ecs_service.api.name }
output "db_instance_identifier" { value = aws_db_instance.main.identifier }
output "db_address" { value = aws_db_instance.main.address }
output "frontend_bucket_name" { value = aws_s3_bucket.frontend.bucket }
output "uploads_bucket_name" { value = aws_s3_bucket.uploads.bucket }
output "cloudfront_distribution_id" { value = var.enable_cloudfront ? aws_cloudfront_distribution.web[0].id : "" }
output "app_instance_id" { value = aws_instance.app.id }
