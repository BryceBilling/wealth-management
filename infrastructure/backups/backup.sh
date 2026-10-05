#!/bin/sh
set -eu
: "${AGE_RECIPIENT:?Set the age public recipient}"
mkdir -p /backups/daily /backups/weekly /backups/monthly
stamp=$(date -u +%Y-%m-%d)
# Pipefail avoids accepting an empty archive if pg_dump fails.
set -o pipefail
pg_dump -Fc | age -r "$AGE_RECIPIENT" > "/backups/daily/$stamp.dump.age.tmp"
mv "/backups/daily/$stamp.dump.age.tmp" "/backups/daily/$stamp.dump.age"
if [ "$(date -u +%u)" = 7 ]; then cp "/backups/daily/$stamp.dump.age" "/backups/weekly/$stamp.dump.age"; fi
if [ "$(date -u +%d)" = 01 ]; then cp "/backups/daily/$stamp.dump.age" "/backups/monthly/$stamp.dump.age"; fi
find /backups/daily -name '*.age' -mtime +7 -delete
find /backups/weekly -name '*.age' -mtime +28 -delete
find /backups/monthly -name '*.age' -mtime +366 -delete
