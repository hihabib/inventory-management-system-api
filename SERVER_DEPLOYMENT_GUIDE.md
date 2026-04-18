# Server Migration Deployment Guide

## Pre-Deployment Checklist

- [ ] Migration file ready (`0015_safe_production_migration.sql`)
- [ ] Database backup plan confirmed
- [ ] Server access credentials ready
- [ ] Application downtime scheduled (if needed)

## Step 1: Prepare Your Server

### 1.1. Upload Migration File to Server

Choose one method:

**Option A: Using SCP**
```bash
scp src/api/v1/drizzle/migrations/0015_safe_production_migration.sql user@your-server:/home/user/migrations/
```

**Option B: Using SFTP**
```bash
sftp user@your-server
put src/api/v1/drizzle/migrations/0015_safe_production_migration.sql /home/user/migrations/
exit
```

**Option C: Copy and paste directly**
- SSH into server
- Create file: `nano /home/user/migrations/0015_safe_production_migration.sql`
- Paste the SQL content
- Save: `Ctrl+O`, `Enter`, `Ctrl+X`

### 1.2. SSH into Your Server

```bash
ssh user@your-server
cd /path/to/your/project
```

## Step 2: Backup Production Database ⚠️ CRITICAL

### 2.1. Create Backup

```bash
# Create backup directory
mkdir -p ~/backups
cd ~/backups

# Backup with timestamp
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Or use custom format (recommended for large databases)
pg_dump -Fc -f backup_$(date +%Y%m%d_%H%M%S).dump $DATABASE_URL

# Verify backup was created
ls -lh backup_*.sql
```

### 2.2. Test Backup (Optional but Recommended)

```bash
# Create a test database
createdb test_restore_$(date +%Y%m%d)

# Restore to test
psql test_restore_$(date +%Y%m%d) < backup_YYYYMMDD_HHMMSS.sql

# Check if tables exist
psql test_restore_$(date +%Y%m%d) -c "\dt"

# Drop test database
dropdb test_restore_$(date +%Y%m%d)
```

## Step 3: Apply Migration

### 3.1. Review Migration File

```bash
# View the migration file
cat /home/user/migrations/0015_safe_production_migration.sql

# Or check line count
wc -l /home/user/migrations/0015_safe_production_migration.sql
```

### 3.2. Apply Migration to Database

**Method A: Using psql with DATABASE_URL**
```bash
psql $DATABASE_URL -f /home/user/migrations/0015_safe_production_migration.sql
```

**Method B: Using psql with connection string directly**
```bash
psql -h your-host -U your-user -d your-database -f /home/user/migrations/0015_safe_production_migration.sql
```

**Method C: Copy-paste SQL into database management tool**
- Open your database management tool (pgAdmin, DBeaver, etc.)
- Connect to production database
- Open SQL editor
- Paste the migration SQL
- Execute

### 3.3. Verify Migration Success

```bash
# Connect to database
psql $DATABASE_URL

# Run verification queries
SELECT 'production_house_stock' as table_name, COUNT(*) as row_count FROM production_house_stock
UNION ALL
SELECT 'stock_allocation_audit', COUNT(*) FROM stock_allocation_audit
UNION ALL
SELECT 'stock_edit_history', COUNT(*) FROM stock_edit_history
UNION ALL
SELECT 'stock_config', COUNT(*) FROM stock_config;

# Verify old tables don't exist (should error)
\dt ready_product  -- Should return "No matching relations found"

# Check columns in production_house_stock
\d production_house_stock

# Exit psql
\q
```

## Step 4: Deploy Application Code

### 4.1. Stop Current Application

```bash
# If using PM2
pm2 stop your-app-name

# Or if using systemd
sudo systemctl stop your-app

# Or if running directly
# Find and kill the process
ps aux | grep node
# kill <process-id>
```

### 4.2. Pull Latest Code

```bash
cd /path/to/your/project
git pull origin main
# or
git pull origin your-branch
```

### 4.3. Install Dependencies (if needed)

```bash
npm ci
# or
pnpm install
```

### 4.4. Build Application

```bash
npm run build
# or
pnpm run build
```

### 4.5. Start Application

```bash
# If using PM2
pm2 start your-app-name

# Or if using systemd
sudo systemctl start your-app

# Or start directly
npm start
# or
pnpm start
```

### 4.6. Check Application Status

```bash
# PM2
pm2 status
pm2 logs your-app-name --lines 50

# Systemd
sudo systemctl status your-app
sudo journalctl -u your-app -f

# Or check if port is listening
netstat -tlnp | grep :8081
# or
lsof -i :8081
```

## Step 5: Smoke Test

### 5.1. Test Health Endpoint

```bash
curl http://localhost:8081/health
# or
curl https://your-domain.com/health
```

### 5.2. Test API Endpoints

```bash
# Test products endpoint
curl http://localhost:8081/api/v1/products

# Test authentication (if applicable)
curl -X POST http://localhost:8081/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

### 5.3. Check Application Logs

```bash
# PM2
pm2 logs your-app-name

# Systemd
sudo journalctl -u your-app -n 100 -f

# Or check log files
tail -f /var/log/your-app/error.log
```

## Step 6: Monitor (First 30 Minutes)

```bash
# Check database connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();"

# Check for errors in logs
grep -i error /var/log/your-app/error.log | tail -20

# Monitor response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8081/health
```

## Rollback Plan (If Issues Occur)

### Option A: Database Rollback Only

```bash
# Stop application
pm2 stop your-app-name

# Restore database
psql $DATABASE_URL < ~/backups/backup_YYYYMMDD_HHMMSS.sql

# Or if using custom format
pg_restore -d $DATABASE_URL ~/backups/backup_YYYYMMDD_HHMMSS.dump

# Restart application
pm2 start your-app-name
```

### Option B: Full Rollback (Code + Database)

```bash
# Stop application
pm2 stop your-app-name

# Restore database
psql $DATABASE_URL < ~/backups/backup_YYYYMMDD_HHMMSS.sql

# Revert code
git checkout previous-commit-hash
npm run build

# Restart application
pm2 start your-app-name
```

## Troubleshooting

### Issue: Migration fails with "table already exists"

**Solution:** Check if migration was partially applied
```bash
psql $DATABASE_URL -c "\dt"
# If production_house_stock exists, migration was partially applied
# You can safely re-run the migration - it uses IF EXISTS/IF NOT EXISTS
```

### Issue: Application won't start

**Solution:** Check logs
```bash
pm2 logs your-app-name --lines 100
# Look for database connection errors or missing tables
```

### Issue: Permission denied on database operations

**Solution:** Check database user permissions
```bash
psql $DATABASE_URL -c "\du"
# Ensure your user has CREATE, ALTER privileges
```

## Post-Deployment Tasks

- [ ] Keep backup for at least 7 days
- [ ] Monitor application for 24 hours
- [ ] Check database performance
- [ ] Verify all features working correctly
- [ ] Document any issues encountered

## Quick Reference Commands

```bash
# Backup
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql

# Check tables
psql $DATABASE_URL -c "\dt"

# Check table structure
psql $DATABASE_URL -c "\d table_name"

# Count rows
psql $DATABASE_URL -c "SELECT COUNT(*) FROM table_name;"

# Check application logs
pm2 logs app-name
tail -f /var/log/app/error.log

# Restart application
pm2 restart app-name
sudo systemctl restart app
```

## Emergency Contact

If you encounter issues during deployment:
1. Stop the application immediately
2. Restore from backup
3. Contact your database administrator or developer
4. Do not attempt to fix without backup available
