# ARCH-06 — where server/config/fileStorage.ts stores prescriptions, lab
# reports, referrals, and patient reports once AWS_S3_BUCKET is set. No
# CloudFront in front of this one: the app serves files via short-lived
# presigned URLs it generates itself, never a public bucket URL.

resource "aws_s3_bucket" "uploads" {
  bucket = "${var.environment}-corehealth-uploads"

  tags = { Name = "${var.environment}-corehealth-uploads" }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
