# Restoring from a backup

Backups live in `/var/backups/msblr/daily` and `/weekly` (see `backup.sh`). Each backup is a pair:
`db-<stamp>.dump` (PostgreSQL custom format) and `uploads-<stamp>.tar.gz`.

Run everything from `/opt/msblr` as the deploy user. Let `C="docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml"`.

## 1. Stop the app (keep the database running)

```bash
$C stop caddy api
```

## 2. Restore the database

```bash
set -a; . deploy/.env.production; set +a
STAMP=20261119-021500   # the backup you want
$C exec -T db psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};"
$C exec -T db psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ${POSTGRES_DB};"
cat /var/backups/msblr/daily/db-$STAMP.dump | $C exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner
```

## 3. Restore uploaded files

```bash
$C run --rm --no-deps -T -v /var/backups/msblr/daily:/backup:ro api sh -c 'rm -rf /data/uploads/* && tar -C /data -xzf /backup/uploads-'"$STAMP"'.tar.gz'
```

## 4. Start again and check

```bash
$C up -d
curl -s https://msblr.com/api/health
```

Log in as an admin and open the Activity log to confirm the data is as expected.

## Test your backups

Once a quarter, restore into a spare server or a scratch database and open the site. A backup that has never been restored is not a backup.
