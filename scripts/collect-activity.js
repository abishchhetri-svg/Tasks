#!/usr/bin/env node
/**
 * Activity Collector Script
 * Runs every 30 minutes via cron
 * Fetches ActivityWatch data + git commits, saves to JSON, pushes to GitHub
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  activityWatchUrl: 'http://localhost:5600/api/0',
  logsDir: path.join(__dirname, '..', 'logs'),
  baseDir: path.join(__dirname, '..'),
  // Projects to track git activity
  projects: [
    { name: 'Tasks', path: '/Users/abishchhetri/Tasks' },
    { name: 'netgear-fe', path: '/Users/abishchhetri/netgear-fe' },
    // Add more projects as needed
  ]
};

// Helper: Get today's file paths
function getTodayPaths() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const filename = `${year}-${month}-${day}-activity.json`;

  return {
    dir: path.join(CONFIG.logsDir, year, month),
    file: path.join(CONFIG.logsDir, year, month, filename),
    year,
    month,
    day
  };
}

// Helper: Ensure directory exists
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

// Fetch ActivityWatch buckets
async function fetchBuckets() {
  try {
    const response = await fetch(`${CONFIG.activityWatchUrl}/buckets`);
    return await response.json();
  } catch (err) {
    console.error('Failed to fetch buckets:', err.message);
    return {};
  }
}

// Fetch events from a bucket
async function fetchEvents(bucketId, hours = 24) {
  try {
    const response = await fetch(
      `${CONFIG.activityWatchUrl}/buckets/${bucketId}/events?limit=1000`
    );
    return await response.json();
  } catch (err) {
    console.error(`Failed to fetch events for ${bucketId}:`, err.message);
    return [];
  }
}

// Get today's time range
function getTodayTimeRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = now;

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startTimestamp: start.getTime(),
    endTimestamp: end.getTime()
  };
}

// Fetch ActivityWatch data
async function fetchActivityWatchData() {
  console.log('Fetching ActivityWatch data...');

  const buckets = await fetchBuckets();
  const bucketIds = Object.keys(buckets);
  const data = {
    buckets: {},
    summary: {
      totalEvents: 0,
      bucketTypes: []
    }
  };

  // Find relevant buckets
  const windowBucket = bucketIds.find(id => id.includes('window'));
  const afkBucket = bucketIds.find(id => id.includes('afk'));
  const webBucket = bucketIds.find(id => id.includes('web') || id.includes('chrome') || id.includes('firefox'));

  // Fetch events from each bucket
  for (const bucketId of [windowBucket, afkBucket, webBucket].filter(Boolean)) {
    const events = await fetchEvents(bucketId);
    data.buckets[bucketId] = {
      metadata: buckets[bucketId],
      events: events.slice(0, 500) // Limit events
    };
    data.summary.totalEvents += events.length;
    data.summary.bucketTypes.push(buckets[bucketId]?.type || 'unknown');
  }

  return data;
}

// Get git commits for today
function getGitActivity() {
  console.log('Fetching git activity...');

  const gitActivity = {
    totalCommits: 0,
    byProject: {},
    commits: []
  };

  const today = new Date().toISOString().split('T')[0];

  for (const project of CONFIG.projects) {
    try {
      // Check if directory exists and is a git repo
      const output = execSync(
        `git log --since="${today} 00:00:00" --until="${today} 23:59:59" --oneline 2>/dev/null || echo ""`,
        { cwd: project.path, encoding: 'utf-8' }
      ).trim();

      if (output) {
        const commits = output.split('\n').filter(line => line.trim());
        gitActivity.byProject[project.name] = commits.length;
        gitActivity.totalCommits += commits.length;

        commits.forEach(commit => {
          gitActivity.commits.push({
            project: project.name,
            message: commit
          });
        });
      }
    } catch (err) {
      // Project might not exist or not a git repo
      console.log(`Skipping ${project.name}: ${err.message}`);
    }
  }

  return gitActivity;
}

// Analyze ActivityWatch data for summary
function analyzeActivityData(awData) {
  const summary = {
    topApps: {},
    topWebsites: {},
    totalActiveTime: 0,
    afkTime: 0
  };

  // Process window bucket
  for (const [bucketId, bucketData] of Object.entries(awData.buckets || {})) {
    if (bucketId.includes('window') && bucketData.events) {
      for (const event of bucketData.events) {
        const app = event.data?.app || 'Unknown';
        const duration = event.duration || 0;

        summary.topApps[app] = (summary.topApps[app] || 0) + duration;
        summary.totalActiveTime += duration;
      }
    }

    if (bucketId.includes('afk') && bucketData.events) {
      for (const event of bucketData.events) {
        if (event.data?.status === 'afk') {
          summary.afkTime += event.duration || 0;
        }
      }
    }

    if (bucketId.includes('web') && bucketData.events) {
      for (const event of bucketData.events) {
        const url = event.data?.url;
        if (url) {
          try {
            const domain = new URL(url).hostname;
            summary.topWebsites[domain] = (summary.topWebsites[domain] || 0) + (event.duration || 0);
          } catch (e) {}
        }
      }
    }
  }

  // Convert to hours and sort
  summary.activeHours = (summary.totalActiveTime / 3600).toFixed(2);
  summary.afkHours = (summary.afkTime / 3600).toFixed(2);

  // Sort apps and websites
  summary.topApps = Object.fromEntries(
    Object.entries(summary.topApps)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  );

  summary.topWebsites = Object.fromEntries(
    Object.entries(summary.topWebsites)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  );

  return summary;
}

// Load existing activity data for today
async function loadExistingData(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Merge new data with existing
function mergeData(existing, newData) {
  if (!existing) return newData;

  // Merge commits (avoid duplicates)
  const existingMessages = new Set(existing.gitActivity?.commits?.map(c => c.message) || []);
  for (const commit of newData.gitActivity.commits) {
    if (!existingMessages.has(commit.message)) {
      existing.gitActivity.commits.push(commit);
      existing.gitActivity.totalCommits++;
      existing.gitActivity.byProject[commit.project] = (existing.gitActivity.byProject[commit.project] || 0) + 1;
    }
  }

  // Update ActivityWatch data (use latest)
  existing.activityWatch = newData.activityWatch;
  existing.summary = newData.summary;

  // Update timestamp
  existing.lastUpdated = new Date().toISOString();

  // Merge manual tasks (if any)
  if (newData.manualTasks && newData.manualTasks.length > 0) {
    existing.manualTasks = [...(existing.manualTasks || []), ...newData.manualTasks];
  }

  return existing;
}

// Git operations
async function commitAndPush(message) {
  try {
    execSync('git add .', { cwd: CONFIG.baseDir, stdio: 'inherit' });
    execSync(`git commit -m "${message}"`, { cwd: CONFIG.baseDir, stdio: 'inherit' });
    execSync('git push', { cwd: CONFIG.baseDir, stdio: 'inherit' });
    console.log('Successfully committed and pushed to GitHub');
  } catch (err) {
    // Might fail if no changes to commit
    if (!err.message.includes('nothing to commit')) {
      console.error('Git error:', err.message);
    }
  }
}

// Main function
async function main() {
  console.log('=== Activity Collector Started ===');
  console.log('Time:', new Date().toISOString());

  const paths = getTodayPaths();
  await ensureDir(paths.dir);

  // Fetch all data
  const activityWatchData = await fetchActivityWatchData();
  const gitActivity = getGitActivity();
  const activitySummary = analyzeActivityData(activityWatchData);

  // Build data object
  const newData = {
    date: `${paths.year}-${paths.month}-${paths.day}`,
    lastUpdated: new Date().toISOString(),
    collectionCount: 1,
    activityWatch: activityWatchData,
    gitActivity: gitActivity,
    summary: activitySummary,
    manualTasks: [] // Will be merged from existing
  };

  // Load and merge with existing data
  const existingData = await loadExistingData(paths.file);
  const finalData = mergeData(existingData, newData);

  if (existingData) {
    finalData.collectionCount = (existingData.collectionCount || 1) + 1;
  }

  // Save to file
  await fs.writeFile(paths.file, JSON.stringify(finalData, null, 2));
  console.log(`Data saved to: ${paths.file}`);

  // Commit and push
  await commitAndPush(`chore: activity data update ${paths.year}-${paths.month}-${paths.day}`);

  console.log('=== Activity Collector Completed ===');
}

// Run
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
