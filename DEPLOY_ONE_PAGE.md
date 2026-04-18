# 🚀 Server Deployment - Quick Reference

## Pre-Deployment (On Your Local Machine)

```bash
# 1. Upload migration to server
scp src/api/v1/drizzle/migrations/0015_safe_production_migration.sql \
    user@server:/home/user/migrations/
```

## On Server Deployment

### 1️⃣ SSH into Server
```bash
ssh user@your-server.com
```

### 2️⃣ Backup Database (MANDATORY!)
```bash
pg_dump $DATABASE_URL > ~/backups/backup_$(date +%Y%m%d_%H%M%S).sql
ls -lh ~/backups/  # Verify backup exists
```

### 3️⃣ Apply Migration
```bash
psql $DATABASE_URL -f ~/migrations/0015_safe_production_migration.sql
```

### 4️⃣ Verify Migration
```bash
psql $DATABASE_URL
```
```sql
-- Run these queries
SELECT COUNT(*) FROM production_house_stock;        -- Should show your data
SELECT COUNT(*) FROM stock_allocation_audit;         -- Should show your data
SELECT COUNT(*) FROM stock_edit_history;             -- Should be 0
SELECT COUNT(*) FROM stock_config;                   -- Should be 0
\d production_house_stock;                           -- Check columns
\q
```

### 5️⃣ Deploy Code
```bash
cd /path/to/project
git pull origin main
npm ci
npm run build
```

### 6️⃣ Restart Application
```bash
# PM2
pm2 restart your-app

# OR Systemd
sudo systemctl restart your-app
```

### 7️⃣ Test Application
```bash
curl http://localhost:8081/health
curl http://localhost:8081/api/v1/products
pm2 logs your-app --lines 20
```

## Rollback (If Something Goes Wrong)

```bash
# Stop app
pm2 stop your-app

# Restore database
psql $DATABASE_URL < ~/backups/backup_YYYYMMDD_HHMMSS.sql

# Start app
pm2 start your-app
```

## What This Migration Does

| Before | After |
|--------|-------|
| `ready_product` | `production_house_stock` |
| `ready_product_allocation` | `stock_allocation_audit` |
| Old column names | New column names |
| No `committed_quantity` | Has `committed_quantity` |
| No audit tables | Has `stock_edit_history` |

## Critical Notes

⚠️ **Always backup before migration**
⚠️ **Keep backup for 7 days**
⚠️ **Monitor for 30 minutes after deployment**
✅ **No data loss - all data is preserved**
✅ **Migration is safe to run multiple times**

## Files to Reference

- Migration SQL: `0015_safe_production_migration.sql`
- Full Guide: `SERVER_DEPLOYMENT_GUIDE.md`
- Quick Script: `QUICK_DEPLOY.sh`
