output "cloudfront_domain_name" {
  description = "The *.cloudfront.net URL — usable immediately, even before a custom domain exists."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.id
}

output "frontend_bucket_arn" {
  description = "For scoping the CI deploy role's S3 sync policy to exactly this bucket (not the uploads bucket)."
  value       = aws_s3_bucket.frontend.arn
}

output "cloudfront_distribution_id" {
  description = "For the CI deploy role's cloudfront:CreateInvalidation policy, and for the deploy workflow's invalidation step."
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_distribution_arn" {
  value = aws_cloudfront_distribution.frontend.arn
}

output "uploads_bucket_name" {
  value = aws_s3_bucket.uploads.id
}

output "uploads_bucket_arn" {
  value = aws_s3_bucket.uploads.arn
}
