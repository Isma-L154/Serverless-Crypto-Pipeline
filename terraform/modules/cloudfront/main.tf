# OAC - To allow CloudFront to read from S3 privately
resource "aws_cloudfront_origin_access_control" "dashboard" {
  name                              = "${var.project_name}-${var.environment}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront distribution
resource "aws_cloudfront_distribution" "dashboard" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "${var.project_name}-${var.environment} dashboard"

  origin {
    domain_name              = var.dashboard_bucket_regional_domain
    origin_id                = "S3-${var.dashboard_bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${var.dashboard_bucket_name}"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    # Cache for 5 minutes to ensure updates to the dashboard are reflected in a timely manner
    min_ttl     = 0
    default_ttl = 300
    max_ttl     = 300
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}