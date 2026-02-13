#!/bin/bash
# Remove cron jobs for Tasks Activity Tracker

echo "Removing Tasks Activity Tracker cron jobs..."

# Get current crontab without our entries
if crontab -l 2>/dev/null | grep -v "collect-activity.js" | grep -v "generate-summary.js" | grep -v "Tasks Activity Tracker" | crontab - 2>/dev/null; then
    echo "Cron jobs removed successfully!"
else
    echo "No cron jobs to remove or error occurred."
fi

echo "Remaining cron jobs:"
crontab -l 2>/dev/null || echo "No cron jobs configured"
