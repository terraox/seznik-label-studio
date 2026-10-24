#!/bin/sh
# Nightly on the droplet (cron, as root): desk files + a Postgres dump. Keeps 14 days.
set -e
DIR=/var/backups/sez-print
STAMP=$(date +%Y%m%d)
tar -czf "$DIR/data-$STAMP.tgz" -C /var/lib/sez-print data
DIRECT=$(grep '^DIRECT_URL=' /etc/sez-print/admin.env | cut -d= -f2-)
pg_dump "$DIRECT" | gzip > "$DIR/db-$STAMP.sql.gz"
find "$DIR" -type f -mtime +14 -delete
