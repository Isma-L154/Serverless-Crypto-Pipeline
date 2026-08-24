variable "name_prefix" {
  description = "Prefix applied to the names of created resources."
  type        = string
}

variable "source_dir" {
  description = "Directory holding the archiver function's source."
  type        = string
}

variable "history_url" {
  description = "Worker endpoint the archiver reads the retained window from."
  type        = string
}

variable "window_hours" {
  description = "How many hours of history to request. Should match the Worker's retention."
  type        = number
  default     = 48

  validation {
    condition     = var.window_hours >= 24 && var.window_hours <= 168
    error_message = "Request between 24 and 168 hours of history."
  }
}

variable "schedule_expression" {
  description = "When the archiver runs. Defaults to 00:30 UTC, shortly after the day it summarises has closed."
  type        = string
  default     = "cron(30 0 * * ? *)"
}

variable "log_retention_days" {
  description = "How long to keep the function's logs. Set explicitly so they cannot accumulate indefinitely."
  type        = number
  default     = 7
}
