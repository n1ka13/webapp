#!/bin/bash

set -e

cd terraform
terraform init
terraform apply -auto-approve

sleep 15

cd ../ansible
ansible-playbook site.yml

echo "Deployment Completed Successfully"