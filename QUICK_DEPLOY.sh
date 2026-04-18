#!/bin/bash

# Quick Server Deployment Script
# Use this as a reference - modify variables for your environment

# ============================================
# CONFIGURATION - Update these values
# ============================================
SERVER_USER="your-user"
SERVER_HOST="your-server.com"
SERVER_PATH="/path/to/your/project"
DATABASE_URL="postgresql://user:pass@host:5432/database"

# ============================================
# STEP 1: Upload migration file
# ============================================
echo "Step 1: Uploading migration file..."
scp src/api/v1/drizzle/migrations/0015_safe_production_migration.sql \
    ${SERVER_USER}@${SERVER_HOST}:/home/${SERVER_USER}/migrations/

# ============================================
# STEP 2: SSH to server and run commands
# ============================================
echo "Step 2: Connecting to server..."
ssh ${SERVER_USER}@${SERVER_HOST} << 'ENDSSH'

# Navigate to project
cd /path/to/your/project

# ============================================
# STEP 3: Backup database
# ============================================
echo "Step 3: Creating database backup..."
mkdir -p ~/backups
pg_dump $DATABASE_URL > ~/backups/backup_$(date +%Y%m%d_%H%M%S).sql
echo "✓ Backup created: ~/backups/backup_$(date +%Y%m%d_%H%M%S).sql"

# ============================================
# STEP 4: Apply migration
# ============================================
echo "Step 4: Applying migration..."
psql $DATABASE_URL -f ~/migrations/0015_safe_production_migration.sql

# ============================================
# STEP 5: Verify migration
# ============================================
echo "Step 5: Verifying migration..."
psql $DATABASE_URL << 'EOF'
SELECT '✓ production_house_stock: ' || COUNT(*) FROM production_house_stock
UNION ALL
SELECT '✓ stock_allocation_audit: ' || COUNT(*) FROM stock_allocation_audit
UNION ALL
SELECT '✓ stock_edit_history: ' || COUNT(*) FROM stock_edit_history
UNION ALL
SELECT '✓ stock_config: ' || COUNT(*) FROM stock_config;
EOF

# ============================================
# STEP 6: Deploy code (if using git)
# ============================================
echo "Step 6: Deploying code..."
git pull origin main
npm ci
npm run build

# ============================================
# STEP 7: Restart application
# ============================================
echo "Step 7: Restarting application..."
pm2 restart your-app-name
# OR
# sudo systemctl restart your-app

# ============================================
# STEP 8: Health check
# ============================================
echo "Step 8: Running health check..."
sleep 5
curl -f http://localhost:8081/health || echo "⚠️ Health check failed"

echo "✓ Deployment complete!"

ENDSSH

# ============================================
# DONE
# ============================================
echo "Deployment completed on server: ${SERVER_HOST}"
