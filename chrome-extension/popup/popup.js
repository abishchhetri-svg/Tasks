// Tasks Activity Tracker - Popup Script

// Configuration
const CONFIG = {
  githubOwner: 'abishchhetri-svg',
  githubRepo: 'Tasks',
  tasksPath: 'logs/2026/feb',
  activityWatchUrl: 'http://localhost:5600'
};

// State
let currentTab = 'completed';

// DOM Elements
const elements = {
  loading: document.getElementById('loading'),
  mainContent: document.getElementById('mainContent'),
  errorState: document.getElementById('errorState'),
  errorDetail: document.getElementById('errorDetail'),
  currentDate: document.getElementById('currentDate'),
  hoursActive: document.getElementById('hoursActive'),
  hoursCoding: document.getElementById('hoursCoding'),
  commitsToday: document.getElementById('commitsToday'),
  quickAddForm: document.getElementById('quickAddForm'),
  taskType: document.getElementById('taskType'),
  taskDescription: document.getElementById('taskDescription'),
  addStatus: document.getElementById('addStatus'),
  taskList: document.getElementById('taskList'),
  learningList: document.getElementById('learningList'),
  tabContent: document.getElementById('tabContent'),
  tabs: document.querySelectorAll('.tab'),
  refreshBtn: document.getElementById('refreshBtn'),
  retryBtn: document.getElementById('retryBtn'),
  openDashboard: document.getElementById('openDashboard')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  setCurrentDate();
  setupEventListeners();
  await loadTodayData();
}

function setCurrentDate() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  elements.currentDate.textContent = today;
}

function setupEventListeners() {
  // Tabs
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Quick Add Form
  elements.quickAddForm.addEventListener('submit', handleQuickAdd);

  // Refresh Button
  elements.refreshBtn.addEventListener('click', loadTodayData);

  // Retry Button
  elements.retryBtn.addEventListener('click', loadTodayData);

  // ActivityWatch Dashboard
  elements.openDashboard.addEventListener('click', () => {
    chrome.tabs.create({ url: CONFIG.activityWatchUrl });
  });
}

function switchTab(tabName) {
  currentTab = tabName;
  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  renderTaskList(tabName);
}

// Data Loading
async function loadTodayData() {
  showLoading();

  try {
    const today = getTodayFilename();
    const data = await fetchTodayLog(today);

    if (data) {
      displayData(data);
    } else {
      // No file exists yet - show empty state
      displayEmptyState();
    }
  } catch (error) {
    showError(error.message);
  }
}

function getTodayFilename() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0').toLowerCase();
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}.md`;
}

async function fetchTodayLog(filename) {
  // Try local storage first (cached)
  const cached = await getCachedData(filename);
  if (cached) {
    return cached;
  }

  // Fetch from GitHub via raw content
  const url = `https://raw.githubusercontent.com/${CONFIG.githubOwner}/${CONFIG.githubRepo}/main/logs/2026/feb/${filename}`;

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      return null; // File doesn't exist yet
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const content = await response.text();
  const parsed = parseDailyLog(content);

  // Cache the data
  await cacheData(filename, parsed);

  return parsed;
}

function parseDailyLog(markdown) {
  const data = {
    hoursActive: 0,
    hoursCoding: 0,
    commitsToday: 0,
    completed: [],
    learning: [],
    inProgress: [],
    blockers: []
  };

  // Parse frontmatter
  const frontmatterMatch = markdown.match(/---\n([\s\S]+?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const hoursActive = frontmatter.match(/hours_active:\s*([\d.]+)/);
    const hoursCoding = frontmatter.match(/hours_coding:\s*([\d.]+)/);
    const commitsToday = frontmatter.match(/commits_today:\s*(\d+)/);

    if (hoursActive) data.hoursActive = parseFloat(hoursActive[1]);
    if (hoursCoding) data.hoursCoding = parseFloat(hoursCoding[1]);
    if (commitsToday) data.commitsToday = parseInt(commitsToday[1]);
  }

  // Parse sections
  const sections = markdown.split(/^###\s+/m);

  sections.forEach(section => {
    const lines = section.split('\n').filter(l => l.trim() && l.trim().startsWith('-'));
    const items = lines.map(l => l.replace(/^-\s*/, '').trim());

    if (section.toLowerCase().includes('completed tasks')) {
      data.completed.push(...items);
    } else if (section.toLowerCase().includes('research & learning') || section.toLowerCase().includes('learnings')) {
      data.learning.push(...items);
    } else if (section.toLowerCase().includes('in progress')) {
      data.inProgress.push(...items);
    } else if (section.toLowerCase().includes('blockers')) {
      data.blockers.push(...items);
    }
  });

  return data;
}

function displayData(data) {
  // Update stats
  elements.hoursActive.textContent = data.hoursActive > 0 ? `${data.hoursActive}h` : '-';
  elements.hoursCoding.textContent = data.hoursCoding > 0 ? `${data.hoursCoding}h` : '-';
  elements.commitsToday.textContent = data.commitsToday || '-';

  // Render lists
  renderTaskList(currentTab);
  renderLearningList(data.learning);

  showMainContent();
}

function displayEmptyState() {
  elements.hoursActive.textContent = '-';
  elements.hoursCoding.textContent = '-';
  elements.commitsToday.textContent = '-';

  elements.taskList.innerHTML = '<li class="empty">No activity logged yet today. Start working!</li>';
  elements.learningList.innerHTML = '<li class="empty">No learnings recorded yet.</li>';

  showMainContent();
}

function renderTaskList(tabName) {
  const taskMap = {
    'completed': 'completed',
    'learning': 'learning',
    'in-progress': 'inProgress'
  };

  // Get data from storage
  chrome.storage.local.get(['todayData'], (result) => {
    const data = result.todayData || {};
    const items = data[taskMap[tabName]] || [];

    if (items.length === 0) {
      elements.taskList.innerHTML = `<li class="empty">No ${tabName.replace('-', ' ')} items yet.</li>`;
      return;
    }

    elements.taskList.innerHTML = items
      .map(item => `<li>${escapeHtml(item)}</li>`)
      .join('');
  });
}

function renderLearningList(learnings) {
  if (!learnings || learnings.length === 0) {
    elements.learningList.innerHTML = '<li class="empty">No learnings recorded yet.</li>';
    return;
  }

  elements.learningList.innerHTML = learnings
    .map(l => `<li>${escapeHtml(l)}</li>`)
    .join('');
}

// Quick Add Handler
async function handleQuickAdd(e) {
  e.preventDefault();

  const type = elements.taskType.value;
  const description = elements.taskDescription.value.trim();

  if (!description) return;

  showAddStatus('Adding...', 'loading');

  try {
    // Add to local storage for immediate display
    await addToTodayData(type, description);

    // Show success message
    showAddStatus('✓ Added! Will sync on next update.', 'success');
    elements.taskDescription.value = '';

    // Refresh display
    renderTaskList(currentTab);

    // Trigger background sync
    chrome.runtime.sendMessage({ type: 'SYNC_TO_GITHUB' });

  } catch (error) {
    showAddStatus('Failed to add. Try again.', 'error');
    console.error('Quick add error:', error);
  }
}

async function addToTodayData(type, description) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['todayData', 'todayDate'], (result) => {
      const today = getTodayFilename();
      const isToday = result.todayDate === today;

      let data = isToday ? (result.todayData || getDefaultData()) : getDefaultData();
      data.todayDate = today;

      const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      switch (type) {
        case 'completed':
          data.completed.push(`[${timestamp}] ${description}`);
          break;
        case 'learning':
          data.learning.push(`[${timestamp}] ${description}`);
          break;
        case 'in-progress':
          data.inProgress.push(`[${timestamp}] ${description}`);
          break;
        case 'blocker':
          data.blockers.push(`[${timestamp}] ${description}`);
          break;
      }

      chrome.storage.local.set({ todayData: data, todayDate: today }, resolve);
    });
  });
}

function getDefaultData() {
  return {
    completed: [],
    learning: [],
    inProgress: [],
    blockers: []
  };
}

// Storage Helpers
async function getCachedData(filename) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['cache'], (result) => {
      const cache = result.cache || {};
      const cached = cache[filename];
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        resolve(cached.data);
      } else {
        resolve(null);
      }
    });
  });
}

async function cacheData(filename, data) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['cache'], (result) => {
      const cache = result.cache || {};
      cache[filename] = {
        data,
        timestamp: Date.now()
      };
      chrome.storage.local.set({ cache }, resolve);
    });
  });
}

// UI State Helpers
function showLoading() {
  elements.loading.classList.remove('hidden');
  elements.mainContent.classList.add('hidden');
  elements.errorState.classList.add('hidden');
}

function showMainContent() {
  elements.loading.classList.add('hidden');
  elements.mainContent.classList.remove('hidden');
  elements.errorState.classList.add('hidden');
}

function showError(message) {
  elements.errorDetail.textContent = message;
  elements.loading.classList.add('hidden');
  elements.mainContent.classList.add('hidden');
  elements.errorState.classList.remove('hidden');
}

function showAddStatus(message, type) {
  elements.addStatus.textContent = message;
  elements.addStatus.className = `status-message ${type}`;
  elements.addStatus.classList.remove('hidden');

  if (type === 'success') {
    setTimeout(() => {
      elements.addStatus.classList.add('hidden');
    }, 3000);
  }
}

// Utility
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
