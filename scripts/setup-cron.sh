#!/bin/bash
# Setup cron jobs for Tasks Activity Tracker
# Run this script once to install the cron jobs

set -e

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPTS_DIR")"
NODE_PATH=$(which node)
ENV_FILE="$PROJECT_DIR/.env"

echo "=== Tasks Activity Tracker - Cron Setup ==="
echo "Project directory: $PROJECT_DIR"
echo "Node path: $NODE_PATH"
echo ""

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "WARNING: .env file not found!"
    echo "Please create .env file from .env.example and add your ANTHROPIC_API_KEY"
    echo ""
    echo "Run: cp $PROJECT_DIR/.env.example $ENV_FILE"
    echo "Then edit $ENV_FILE and add your API key"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    echo "Loading environment from .env..."
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# Create log directory for cron output
mkdir -p "$PROJECT_DIR/logs/cron"

# Create the cron entries with environment loading
CRON_ENTRIES="# Tasks Activity Tracker
# Collect activity data every 30 minutes
*/30 * * * * cd $PROJECT_DIR && export \$(grep -v '^#' .env | xargs) && $NODE_PATH $SCRIPTS_DIR/collect-activity.js >> $PROJECT_DIR/logs/cron/collect.log 2>&1

# Generate daily summary at 10 PM
0 22 * * * cd $PROJECT_DIR && export \$(grep -v '^#' .env | xargs) && $NODE_PATH $SCRIPTS_DIR/generate-summary.js >> $PROJECT_DIR/logs/cron/summary.log 2>&1
"

# Check if cron entries already exist
if crontab -l 2>/dev/null | grep -q "collect-activity.js"; then
    echo "Cron jobs already installed. To reinstall, first run: npm run remove-cron"
    echo ""
    echo "Current cron jobs:"
    crontab -l | grep -A2 "Tasks Activity Tracker" || true
    exit 0
fi

# Add to existing crontab
if crontab -l &>/dev/null; then
    (crontab -l 2>/dev/null; echo ""; echo "$CRON_ENTRIES") | crontab -
else
    echo "$CRON_ENTRIES" | crontab -
fi

echo "Cron jobs installed successfully!"
echo ""
echo "Installed jobs:"
echo "  - Activity collection: every 30 minutes"
echo "  - Daily summary generation: at 10:00 PM"
echo ""
echo "View logs at:"
echo "  - $PROJECT_DIR/logs/cron/collect.log"
echo "  - $PROJECT_DIR/logs/cron/summary.log"
echo ""
echo "To view cron jobs: crontab -l"
echo "To remove cron jobs: npm run remove-cron"
