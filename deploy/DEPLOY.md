# Deploying MSBLR E-Directory to a VPS

Target: one Ubuntu 22.04/24.04 VPS (2 GB RAM minimum) running Docker. The stack is Postgres 16, the API, and Caddy (automatic HTTPS, serves the web build, proxies `/api` and `/files`).

## 1. DNS

At your domain registrar create:

| Type | Name | Value |
|------|------|-------|
| A | `@` (msblr.com) | VPS public IPv4 |
| A | `www` | VPS public IPv4 |

Wait until `dig +short msblr.com` returns the VPS address. Caddy cannot get a certificate before that.

## 2. Harden the server (first login as root)

```bash
# non-root user with sudo
adduser deploy
usermod -aG sudo deploy

# SSH keys: copy your public key, then disable passwords and root login
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Open a second terminal and confirm `ssh deploy@<ip>` works before closing the root session.

```bash
# firewall: only SSH, HTTP, HTTPS
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# fail2ban against SSH brute force
sudo apt update && sudo apt install -y fail2ban unattended-upgrades
sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades
```

Install Docker (official script) and allow the deploy user to use it:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy   # log out and in again
```

## 3. First deploy (as `deploy`)

```bash
sudo mkdir -p /opt/msblr && sudo chown deploy:deploy /opt/msblr
git clone <your repository url> /opt/msblr
cd /opt/msblr
cp deploy/.env.production.example deploy/.env.production
nano deploy/.env.production      # set strong POSTGRES_PASSWORD and JWT_SECRET (openssl rand -base64 48)
chmod 600 deploy/.env.production

docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml up -d --build
docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml logs -f api   # wait for "listening"
```

The API runs `prisma migrate deploy` on every start. Production does not run the demo seed.

### Create the first super admin and base data

Roles, permissions, zones and settings must exist before anyone can log in. Run the seed's reference-data part once on the new database, then add the committee's super admin mobile number:

```bash
cd /opt/msblr
C="docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml"
$C exec api npx tsx prisma/seed.ts          # NOTE: this loads demo data too. Ask the developer for the production seed option before first use.
```

If a production-only seed is not available yet, ask the developer to provide it; do not run the demo seed on a live system that already has real members.

Check `https://msblr.com/api/health` returns `{"data":{"ok":true,...}}` and that the site loads.

## 4. Backups

```bash
sudo mkdir -p /var/backups/msblr && sudo chown deploy:deploy /var/backups/msblr
chmod +x /opt/msblr/deploy/backup.sh
crontab -e
# add:
15 2 * * * /opt/msblr/deploy/backup.sh >> /var/log/msblr-backup.log 2>&1
```

Copy `/var/backups/msblr` off the server regularly (for example `rsync` to another machine or object storage). See `restore.md` to restore.

## 5. Updating

```bash
cd /opt/msblr
git pull
C="docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml"
/opt/msblr/deploy/backup.sh            # always take a backup first
$C up -d --build                       # rebuilds web + api, applies migrations on api start
$C logs --tail=100 api
```

Rollback: `git checkout <previous tag or commit>` and run `$C up -d --build`. If a migration changed the database, restore the backup (see `restore.md`).

## 6. Day-to-day

- Logs: `$C logs -f api` / `$C logs -f caddy`
- Status: `$C ps`
- Disk: `df -h` and `docker system df`; prune old images with `docker image prune -f`
- Never put real credentials in git. `deploy/.env.production` stays on the server only.
