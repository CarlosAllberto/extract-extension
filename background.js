const SEARCH_RE = /^https:\/\/www\.google\.(com|com\.br)\/maps\/search\//;

function openInterface() {
  chrome.tabs.create({ url: chrome.runtime.getURL('interface.html') });
}

// Abre a interface ao clicar no ícone
chrome.action.onClicked.addListener(() => {
  openInterface();
});

// Na instalação/atualização, abre a interface
chrome.runtime.onInstalled.addListener(() => {
  openInterface();
});

// Executa content.js apenas uma vez por página de busca
function bootIfNeeded(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (window.__gmapsExtractorBooted || window.__gmapsExtractorBooting) return 'skip';
      window.__gmapsExtractorBooting = true;
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
          window.__gmapsExtractorBooted = true;
          window.__gmapsExtractorBooting = false;
        },
      });
    } catch (err) {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          window.__gmapsExtractorBooting = false;
        },
      }).catch(() => {});
      console.warn('inject err:', err.message);
    }
  }).catch(err => console.warn('boot err:', err.message));
}

// onUpdated: quando terminar de carregar
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && SEARCH_RE.test(tab.url)) {
    bootIfNeeded(tabId);
  }
});

// SPA do Maps
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, url, frameId }) => {
  if (frameId === 0 && url && SEARCH_RE.test(url)) bootIfNeeded(tabId);
}, {
  url: [
    { hostEquals: 'www.google.com',    pathPrefix: '/maps/search/' },
    { hostEquals: 'www.google.com.br', pathPrefix: '/maps/search/' }
  ]
});

// Navegação completa (algumas variações)
chrome.webNavigation.onCompleted.addListener(({ tabId, url, frameId }) => {
  if (frameId === 0 && url && SEARCH_RE.test(url)) bootIfNeeded(tabId);
}, {
  url: [
    { hostEquals: 'www.google.com',    pathPrefix: '/maps/search/' },
    { hostEquals: 'www.google.com.br', pathPrefix: '/maps/search/' }
  ]
});
