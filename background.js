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

// Executa uma função para checar/definir flag e só então carrega content.js
function bootIfNeeded(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (window.__gmapsExtractorBooted) return 'exists';
      window.__gmapsExtractorBooted = true;
      return 'boot';
    }
  }).then(([res]) => {
    if (res && res.result === 'boot') {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      }).catch(err => console.warn('inject err:', err.message));
    }
  }).catch(err => console.warn('flag err:', err.message));
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
