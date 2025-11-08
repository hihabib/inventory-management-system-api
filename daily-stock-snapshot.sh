#!/bin/bash
# Load NVM if you installed Node via NVM; skip if using system Node in /usr/bin


# Absolute path to your project
PROJECT_DIR="/var/www/atif-agro-api"

# Absolute path to Node (replace with `which node` result)
NODE_BIN="/usr/bin/node"

# Create logs directory if not exists
mkdir -p "$PROJECT_DIR/logs"

# Change to project directory so dotenv loads .env correctly
cd "$PROJECT_DIR"

# Run script and capture logs with timestamp
TS="$(date +"%Y-%m-%d %H:%M:%S")"
echo "[$TS] Starting daily-stock-snapshot..." >> "$PROJECT_DIR/logs/daily-stock-snapshot.log"
"$NODE_BIN" daily-stock-snapshot.js >> "$PROJECT_DIR/logs/daily-stock-snapshot.log" 2>&1
echo "[$TS] Finished daily-stock-snapshot." >> "$PROJECT_DIR/logs/daily-stock-snapshot.log"