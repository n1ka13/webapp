terraform {
  required_providers {
    libvirt = {
      source  = "dmacvicar/libvirt"
      version = "~> 0.7.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

provider "libvirt" {
  uri = "qemu:///system"
}

provider "tls" {}

resource "tls_private_key" "ansible_key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "local_sensitive_file" "ansible_private_key" {
  content         = tls_private_key.ansible_key.private_key_pem
  filename        = "${path.module}/../ansible/ansible_id_rsa"
  file_permission = "0600"
}

resource "libvirt_volume" "ubuntu_base" {
  name   = "ubuntu-base.qcow2"
  pool   = "default"
  source = "https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-arm64.img"
  format = "qcow2"
}

resource "libvirt_volume" "worker_disk" {
  name           = "worker-disk.qcow2"
  base_volume_id = libvirt_volume.ubuntu_base.id
  pool           = "default"
  size           = 10737418240 # 10 GB
}

resource "libvirt_volume" "db_disk" {
  name           = "db-disk.qcow2"
  base_volume_id = libvirt_volume.ubuntu_base.id
  pool           = "default"
  size           = 10737418240 # 10 GB
}

resource "libvirt_cloudinit_disk" "worker_init" {
  name      = "worker_init.iso"
  user_data = templatefile("${path.module}/cloud_init.cfg", {
    ssh_key  = trimspace(tls_private_key.ansible_key.public_key_openssh),
    hostname = "worker"
  })
  pool      = "default"
}

resource "libvirt_cloudinit_disk" "db_init" {
  name      = "db_init.iso"
  user_data = templatefile("${path.module}/cloud_init.cfg", {
    ssh_key  = trimspace(tls_private_key.ansible_key.public_key_openssh),
    hostname = "db"
  })
  pool      = "default"
}

resource "libvirt_domain" "worker" {
  name     = "worker-vm"
  memory   = "2048"
  vcpu     = 2
  type     = "qemu"
  arch     = "aarch64"
  emulator = "/usr/bin/qemu-system-aarch64"

  cloudinit = libvirt_cloudinit_disk.worker_init.id

  network_interface {
    network_name   = "default"
    wait_for_lease = true
  }

  disk {
    volume_id = libvirt_volume.worker_disk.id
    bus       = "virtio"
  }

  console {
    type        = "pty"
    target_port = "0"
    target_type = "serial"
  }

  graphics {
    type        = "spice"
    listen_type = "address"
    autoport    = true
  }

  video {
    type = "virtio"
  }
}

resource "libvirt_domain" "db" {
  name     = "db-vm"
  memory   = "2048"
  vcpu     = 2
  type     = "qemu"
  arch     = "aarch64"
  emulator = "/usr/bin/qemu-system-aarch64"
  cloudinit = libvirt_cloudinit_disk.db_init.id

  network_interface {
    network_name   = "default"
    wait_for_lease = true
  }

  disk {
    volume_id = libvirt_volume.db_disk.id
    bus       = "virtio"
  }

  console {
    type        = "pty"
    target_port = "0"
    target_type = "serial"
  }

  graphics {
    type        = "spice"
    listen_type = "address"
    autoport    = true
  }

  video {
    type = "virtio"
  }
}

output "worker_ip" {
  value = libvirt_domain.worker.network_interface[0].addresses[0]
}

output "db_ip" {
  value = libvirt_domain.db.network_interface[0].addresses[0]
}

# Fully automated declarative generation of inventory.ini with precise explicit parameter mappings
resource "local_file" "ansible_inventory" {
  content  = <<EOT
[workers]
worker ansible_host=${libvirt_domain.worker.network_interface[0].addresses[0]} ansible_user=ansible ansible_ssh_private_key_file=ansible_id_rsa

[db]
db ansible_host=${libvirt_domain.db.network_interface[0].addresses[0]} ansible_user=ansible ansible_ssh_private_key_file=ansible_id_rsa
EOT
  filename = "${path.module}/../ansible/inventory.ini"
}