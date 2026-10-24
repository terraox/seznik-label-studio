#!/bin/sh
# Run on your Mac from the repo root, on the production branch: sh deploy/deploy.sh
# Sends the committed source, builds on the droplet (native modules must be built for Linux),
# migrates, switches the release and restarts. Needs DROPLET_IP and the key at ~/Desktop/digitalocean.
set -e
HOST="${DROPLET_IP:-143.244.134.114}"
KEY="${DROPLET_KEY:-$HOME/Desktop/digitalocean}"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new root@$HOST"
SHA=$(git rev-parse --short HEAD)
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash first: working tree is not clean."; exit 1; }
REL=/opt/sez-print/releases/$SHA
echo "== sending $SHA"
git archive HEAD admin src/lib/clipart | $SSH "rm -rf $REL && mkdir -p $REL && tar -x -C $REL"
echo "== building on the droplet"
$SSH "set -e
ln -sfn /var/lib/sez-print/data $REL/admin/data
cd $REL/admin
set -a; . /etc/sez-print/admin.env; set +a
node scripts/env-check.mjs
npm ci --no-audit --no-fund
npm run build
npx prisma migrate deploy
chown -R sez:sez $REL
ln -sfn $REL /opt/sez-print/current
systemctl restart sez-print-admin
sleep 4
curl -fsS http://127.0.0.1:3000/api/health && echo
ls -1dt /opt/sez-print/releases/* | tail -n +4 | xargs -r rm -rf"
echo "== live: https://api2.seznik.in/api/health"
