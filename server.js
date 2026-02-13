// Tasks Local API Server
// Acts as the database backend for the Chrome extension
// Reads/writes to Tasks repository and handles git operations

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

const CONFIG = {
  tasksDir: path.join(__dirname, 'logs'),
  dataDir: path.join(__dirname, 'data'),
  port: 3001,
  githubBranch: 'main'
};

// Helper: Get today's file path
function getTodayFilePath() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0').toLowerCase();
  const day = String(now.getDate()).padStart(2, '0');
  const filename = `${year}-${month}-${day}.md`;

  return {
    dir: path.join(CONFIG.tasksDir, String(year), month),
    file: path.join(CONFIG.tasksDir, String(year), month, filename)
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

// Helper: Get today's manual tasks file
function getManualTasksFile() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return path.join(CONFIG.dataDir, 'manual-tasks.json');
}

// Helper: Load manual tasks for today
async function loadManualTasks() {
  const file = getManualTasksFile();
  try {
    const content = await fs.readFile(file, 'utf-8');
    const data = JSON.parse(content);
    // Filter only today's tasks
    const today = new Date().toISOString().split('T')[0];
    return (data.tasks || []).filter(t => t.date === today);
  } catch (err) {
    return [];
  }
}

// Helper: Save manual task
async function saveManualTask(task) {
  await ensureDir(CONFIG.dataDir);
  const file = getManualTasksFile();

  let data = { tasks: [] };
  try {
    const content = await fs.readFile(file, 'utf-8');
    data = JSON.parse(content);
  } catch (err) {
    // File doesn't exist, use default
  }

  // Add new task with timestamp
  const today = new Date().toISOString().split('T')[0];
  data.tasks.push({
    ...task,
    date: today,
    timestamp: new Date().toISOString()
  });

  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

// Helper: Read and parse today's log
async function readTodayLog() {
  const { file } = getTodayFilePath();

  try {
    const content = await fs.readFile(file, 'utf-8');
    return parseLog(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File doesn't exist yet
      return null;
    }
    throw err;
  }
}

// Helper: Parse markdown log into structured data
function parseLog(markdown) {
  const data = {
    frontmatter: {},
    sections: {}
  };

  // Parse frontmatter
  const frontmatterMatch = markdown.match(/---\n([\s\S]+?)\n---/);
  if (frontmatterMatch) {
    frontmatterMatch[1].split('\n').forEach(line => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length) {
        const value = valueParts.join(':').trim();
        data.frontmatter[key.trim()] = value;
      }
    });
  }

  // Parse sections
  const sections = markdown.split(/^###\s+/m);
  sections.forEach(section => {
    const titleMatch = section.match(/^([^\n]+)/);
    if (titleMatch) {
      const title = titleMatch[1].trim().toLowerCase();
      const items = section
        .split('\n')
        .filter(l => l.trim() && l.trim().startsWith('-'))
        .map(l => l.replace(/^-\s*/, '').trim());

      data.sections[title] = items;
    }
  });

  return data;
}

// Helper: Generate markdown from data
function generateMarkdown(existingData, newData) {
  const now = new Date();
  const timestamp = now.toISOString();

  // Start with existing or new frontmatter
  let frontmatter = existingData?.frontmatter || {
    date: now.toISOString().split('T')[0],
    updated: timestamp,
    hours_active: 0,
    hours_coding: 0,
    commits_today: 0,
    projects: [],
    tags: []
  };

  // Update timestamp
  frontmatter.updated = timestamp;

  // Build frontmatter string
  let md = '---\n';
  Object.entries(frontmatter).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      md += `${key}: [${value.join(', ')}]\n`;
    } else {
      md += `${key}: ${value}\n`;
    }
  });
  md += '---\n\n';

  // Build sections
  const sections = existingData?.sections || {};

  // Add new data to sections
  if (newData.completed?.length) {
    const key = 'completed tasks';
    sections[key] = [...(sections[key] || []), ...newData.completed];
  }

  if (newData.learning?.length) {
    const key = 'research & learning';
    sections[key] = [...(sections[key] || []), ...newData.learning];
  }

  if (newData.inProgress?.length) {
    const key = 'in progress';
    sections[key] = [...(sections[key] || []), ...newData.inProgress];
  }

  if (newData.blockers?.length) {
    const key = 'blockers';
    sections[key] = [...(sections[key] || []), ...newData.blockers];
  }

  // Generate sections
  const sectionOrder = [
    { key: 'activity summary', title: '## 📊 Activity Summary\n\n_Actual stats updated by daily log_' },
    { key: 'work analysis', title: '## 🎯 Work Analysis' },
    { key: 'completed tasks', title: '### Completed Tasks' },
    { key: 'in progress', title: '### In Progress' },
    { key: 'research & learning', title: '### Research & Learning' },
    { key: 'blockers', title: '### Blockers' },
    { key: 'ai insights', title: '## 💡 AI Insights' },
    { key: "tomorrow's plan", title: '## 📅 Tomorrow\\'s Plan' }
  ];

  sectionOrder.forEach(({ key, title }) => {
    if (sections[key]) {
      md += `${title}\n\n`;
      sections[key].forEach(item => {
        md += `- ${item}\n`;
      });
      md += '\n';
    }
  });

  return md;
}

// Helper: Commit and push to git
async function commitAndPush(message) {
  try {
    execSync('git add .', { cwd: __dirname });
    execSync(`git commit -m "${message}"`, { cwd: __dirname });
    execSync('git push', { cwd: __dirname });
    console.log('✓ Committed and pushed to GitHub');
  } catch (err) {
    console.error('Git error:', err.message);
    throw err;
  }
}

// API Routes
const express = require('express');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// GET /api/tasks - Get today's log
app.get('/api/tasks', async (req, res) => {
  try {
    const data = await readTodayLog();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks - Add new entries from extension
app.post('/api/tasks', async (req, res) => {
  try {
    const { data } = req.body;

    // Save manual tasks for Claude analysis
    if (data.completed?.length) {
      for (const task of data.completed) {
        await saveManualTask({ type: 'completed', content: task });
      }
    }
    if (data.learning?.length) {
      for (const item of data.learning) {
        await saveManualTask({ type: 'learning', content: item });
      }
    }
    if (data.inProgress?.length) {
      for (const item of data.inProgress) {
        await saveManualTask({ type: 'inProgress', content: item });
      }
    }
    if (data.blockers?.length) {
      for (const item of data.blockers) {
        await saveManualTask({ type: 'blocker', content: item });
      }
    }

    // Commit and push
    try {
      execSync('git add .', { cwd: __dirname });
      execSync(`git commit -m "chore: manual task update from extension"`, { cwd: __dirname });
      execSync('git push', { cwd: __dirname });
    } catch (err) {
      // Ignore git errors (no changes, etc.)
    }

    res.json({
      success: true,
      message: 'Tasks saved and will be included in daily analysis'
    });

  } catch (err) {
    console.error('POST error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/activitywatch - Proxy ActivityWatch API
app.get('/api/activitywatch', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('http://localhost:5600/api/0/buckets/');
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/manual-tasks - Get today's manual tasks
app.get('/api/manual-tasks', async (req, res) => {
  try {
    const tasks = await loadManualTasks();
    res.json({ success: true, tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start server
app.listen(CONFIG.port, () => {
  console.log(`Tasks API Server running on http://localhost:${CONFIG.port}`);
  console.log('Press Ctrl+C to stop');
});
