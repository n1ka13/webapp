variable "ssh_key" {
  description = "Public SSH key dedicated for the automated ansible management user"
  type        = string
  default     = "ssh-rsa " 
}