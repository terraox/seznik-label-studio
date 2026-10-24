#!/bin/sh
# One-time droplet setup. Run as root on a fresh Ubuntu: sh setup-droplet.sh
set -e
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ufw fail2ban rsync curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https postgresql-client
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
# Caddy
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
# Swap, so a build cannot take the box down
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Service user and folders
id sez >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin sez
mkdir -p /opt/sez-print/releases /var/lib/sez-print/data /var/backups/sez-print /etc/sez-print
chown -R sez:sez /opt/sez-print /var/lib/sez-print
chown root:sez /etc/sez-print && chmod 750 /etc/sez-print
# Firewall: SSH, HTTP, HTTPS only
ufw default deny incoming && ufw default allow outgoing
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable
# SSH: keys only
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd
systemctl enable --now fail2ban
echo "Done. Next: put /etc/sez-print/admin.env (mode 640, root:sez), install deploy/Caddyfile and deploy/sez-print-admin.service."
