// Background Service Worker for Tasks Activity Tracker

// Configuration
const CONFIG = {
  localApiUrl: 'http://localhost:3001/api/tasks',
  activityWatchUrl: 'http://localhost:5600'
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_TO_GITHUB') {
    handleSync().then(sendResponse);
    return true; // Keep message channel open for async response
  }
});

// Handle sync to GitHub via local API
async function handleSync() {
  try {
    // Get today's data from storage
    const data = await getTodayData();

    if (!data || !data.hasNewData) {
      return { success: true, message: 'No new data to sync' };
    }

    // Send to local API which will commit to git
    const response = await fetch(CONFIG.localApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    // Clear the new data flag
    await clearNewDataFlag();

    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon48.png',
      title: 'Tasks Activity',
      message: 'Successfully synced to GitHub!'
    });

    return { success: true };

  } catch (error) {
    console.error('Sync error:', error);

    // Show error notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon48.png',
      title: 'Tasks Activity - Sync Failed',
      message: error.message
    });

    return { success: false, error: error.message };
  }
}

// Get today's data from storage
async function getTodayData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['todayData', 'hasNewData'], (result) => {
      resolve({
        data: result.todayData || {},
        hasNewData: result.hasNewData || false
      });
    });
  });
}

// Clear new data flag after sync
async function clearNewDataFlag() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ hasNewData: false }, resolve);
  });
}

// Set up alarm for periodic sync
chrome.alarms.create('syncAlarm', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncAlarm') {
    handleSync();
  }
});

// Listen for storage changes to set hasNewData flag
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.todayData) {
    chrome.storage.local.set({ hasNewData: true });
  }
});

// Handle installation/update
chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.local.set({
    hasNewData: false,
    todayDate: null
  });
});
