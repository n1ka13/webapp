#!/bin/bash

set -e

sudo apt update && sudo apt upgrade -y

sudo apt install -y qemu-system-arm qemu-efi-aarch64 libvirt-daemon-system libvirt-clients bridge-utils virtinst

sudo systemctl enable --now libvirtd

sudo usermod -aG libvirt $USER
sudo usermod -aG kvm $USER

sudo apt install -y gnupg software-properties-common wget
wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install -y terraform

sudo apt install -y ansible git

sudo apt install -y genisoimage

sudo mkdir -p /var/lib/libvirt/images
sudo virsh pool-define-as default dir - - - - "/var/lib/libvirt/images" || true
sudo virsh pool-build default || true
sudo virsh pool-start default || true
sudo virsh pool-autostart default || true
