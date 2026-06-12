const SEARCH_RE = /^https:\/\/www\.google\.(com|com\.br)\/maps\/search\//;

function openInterface() {
  chrome.tabs.create({ url: chrome.runtime.getURL('interface.html') });
}

// Open the interface when the icon is clicked
chrome.action.onClicked.addListener(() => {
  openInterface();
});

// On install/update, open the interface
chrome.runtime.onInstalled.addListener(() => {
  openInterface();
});

// Run content.js only once per search page
function bootIfNeeded(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (window.__extractBooted || window.__extractBooting) return 'skip';
      window.__extractBooting = true;
      return 'boot';
    },
  }).then(async ([res]) => {
    if (res?.result !== 'boot') return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });

      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          window.__extractBooted = true;
          window.__extractBooting = false;
        },
      });
    } catch (err) {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          window.__extractBooting = false;
        },
      }).catch(() => {});
      console.warn('inject err:', err.message);
    }
  }).catch(err => console.warn('boot err:', err.message));
}

// onUpdated: when loading completes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && SEARCH_RE.test(tab.url)) {
    bootIfNeeded(tabId);
  }
});

// Maps SPA navigation
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, url, frameId }) => {
  if (frameId === 0 && url && SEARCH_RE.test(url)) bootIfNeeded(tabId);
}, {
  url: [
    { hostEquals: 'www.google.com',    pathPrefix: '/maps/search/' },
    { hostEquals: 'www.google.com.br', pathPrefix: '/maps/search/' }
  ]
});

// Full navigation (some variations)
chrome.webNavigation.onCompleted.addListener(({ tabId, url, frameId }) => {
  if (frameId === 0 && url && SEARCH_RE.test(url)) bootIfNeeded(tabId);
}, {
  url: [
    { hostEquals: 'www.google.com',    pathPrefix: '/maps/search/' },
    { hostEquals: 'www.google.com.br', pathPrefix: '/maps/search/' }
  ]
});
