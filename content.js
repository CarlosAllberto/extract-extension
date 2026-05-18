(() => {
  const SEARCH_PATH_RE = /\/maps\/search\//;
  const STORAGE_KEYS = {
    webhook: 'gmaps_extractor_webhook',
    leads: 'gmaps_leads',
  };

  if (!SEARCH_PATH_RE.test(location.href)) return;
  if (window.__gmapsExtractorRunning) return;
  window.__gmapsExtractorRunning = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const log = (...args) => console.log('[GMaps Extractor]', ...args);

  function getFromStorage(key, fallback) {
    return new Promise((resolve) => {
      try {
        chrome.storage?.local?.get(key, (result) => {
          resolve(result?.[key] ?? fallback);
        });
      } catch {
        resolve(fallback);
      }
    });
  }

  function setToStorage(values) {
    return new Promise((resolve) => {
      try {
        chrome.storage?.local?.set(values, () => resolve(true));
      } catch {
        resolve(false);
      }
    });
  }

  const getSavedWebhook = () => getFromStorage(STORAGE_KEYS.webhook, '');
  const saveWebhook = (url) => setToStorage({ [STORAGE_KEYS.webhook]: url });
  const getSavedLeads = async () => {
    const leads = await getFromStorage(STORAGE_KEYS.leads, []);
    return Array.isArray(leads) ? leads : [];
  };
  const saveLeads = (leads) => setToStorage({ [STORAGE_KEYS.leads]: leads });

  function ensureStyles() {
    if (document.getElementById('gmaps-extractor-style')) return;

    const style = document.createElement('style');
    style.id = 'gmaps-extractor-style';
    style.textContent = `
      .gmapsx-toast{position:fixed;right:18px;bottom:18px;z-index:999999;background:#0a0a0a;color:#f8fafc;border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:12px 14px;box-shadow:0 18px 50px rgba(0,0,0,.65);font:600 13px/1.4 Inter,system-ui,-apple-system,Segoe UI,Roboto;opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease;pointer-events:none;max-width:min(420px,calc(100vw - 36px));}
      .gmapsx-toast.show{opacity:1;transform:translateY(0)}
      .gmapsx-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;z-index:999999;}
      .gmapsx-modal{width:min(520px,94vw);background:#000000;border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:18px;box-shadow:0 30px 80px rgba(0,0,0,.75);color:#e7ecf3;font:500 14px/1.45 Inter,system-ui,-apple-system,Segoe UI,Roboto;}
      .gmapsx-modal header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
      .gmapsx-modal h3{margin:0;font-size:18px}
      .gmapsx-modal .close{border:none;background:transparent;color:#9aa4b2;font-size:22px;cursor:pointer}
      .gmapsx-modal .body{padding:8px 0}
      .gmapsx-modal label{display:block;font-size:12px;color:#9aa4b2;margin:0 0 6px 2px}
      .gmapsx-modal input[type="text"]{box-sizing:border-box;width:100%;max-width:100%;display:block;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:#050505;color:#e7ecf3;outline:none}
      .gmapsx-modal .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap}
      .gmapsx-btn{cursor:pointer;border:1px solid rgba(255,255,255,.12);background:transparent;color:#fff;padding:10px 14px;border-radius:999px;font-weight:700}
      .gmapsx-btn.primary{background:linear-gradient(90deg,rgba(255,79,0,.95),rgba(255,122,51,.92));border-color:transparent;color:#fff}
      .gmapsx-btn:disabled{opacity:.7;cursor:not-allowed}
    `;
    document.documentElement.appendChild(style);
  }

  function showToast(message, ok = true) {
    ensureStyles();
    let toast = document.getElementById('gmapsx-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'gmapsx-toast';
      toast.className = 'gmapsx-toast';
      document.body.appendChild(toast);
    }

    toast.style.borderColor = ok ? 'rgba(255,79,0,.5)' : 'rgba(239,68,68,.45)';
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function isValidWebhookUrl(url) {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function textFrom(element) {
    return normalizeText(element?.innerText || element?.textContent || '');
  }

  function cleanLabeledText(text, labels) {
    let cleaned = normalizeText(text);
    for (const label of labels) {
      cleaned = cleaned.replace(new RegExp(`^${label}\\s*:?\\s*`, 'i'), '');
    }
    return normalizeText(cleaned);
  }

  function formatBrazilianPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
      digits = digits.slice(2);
    }

    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }

    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }

    return normalizeText(value);
  }

  function findScrollableFeed() {
    const direct = document.querySelector('#pane div[role="feed"], div[role="feed"]');
    if (direct) return direct;

    const candidates = [
      ...document.querySelectorAll('#pane .m6QErb, #pane div[aria-label], #pane div'),
    ];

    return candidates.find((element) => {
      const style = getComputedStyle(element);
      const canScroll = element.scrollHeight > element.clientHeight + 10;
      return canScroll && /(auto|scroll)/.test(style.overflowY);
    }) || null;
  }

  async function waitForResultsPanel() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const feed = findScrollableFeed();
      if (feed || document.querySelector('#pane a.hfpxzc[href*="/maps/place/"]')) {
        return feed;
      }
      await sleep(250);
    }
    return findScrollableFeed();
  }

  function hasLoadingIndicator() {
    return Boolean(document.querySelector([
      '#pane [role="progressbar"]',
      '#pane [aria-busy="true"]',
      '#pane svg[aria-label*="Carregando" i]',
      '#pane svg[aria-label*="Loading" i]',
    ].join(',')));
  }

  function hasEndOfListMarker() {
    const text = textFrom(document.querySelector('#pane'));
    return /chegou ao final da lista|you.ve reached the end|back to top|voltar ao início/i.test(text);
  }

  async function scrollResultsToEnd(feed) {
    if (!feed) return;

    let stableScrolls = 0;
    let lastHeight = 0;

    for (let attempt = 0; attempt < 90; attempt += 1) {
      feed.scrollBy(0, Math.max(700, Math.floor(feed.clientHeight * 0.85)));
      await sleep(450);

      if (hasLoadingIndicator()) await sleep(700);

      if (feed.scrollHeight === lastHeight) stableScrolls += 1;
      else stableScrolls = 0;

      lastHeight = feed.scrollHeight;
      if (stableScrolls >= 8 || hasEndOfListMarker()) break;
    }
  }

  function isSponsoredResult(anchor) {
    const card = anchor.closest('[role="article"], .Nv2PK, div');
    const text = textFrom(card || anchor);
    return Boolean(
      anchor.closest('[data-result-ad="1"], [jsaction*="ad"]') ||
      /patrocinado|sponsored| anúncio | ad /i.test(` ${text} `)
    );
  }

  function collectResultUrls() {
    const urls = new Set();
    const anchors = document.querySelectorAll('#pane a.hfpxzc[href*="/maps/place/"], a.hfpxzc[href*="/maps/place/"]');

    for (const anchor of anchors) {
      if (!anchor.href || isSponsoredResult(anchor)) continue;
      urls.add(anchor.href.split('&entry=')[0]);
    }

    return [...urls];
  }

  function findResultAnchorByUrl(url) {
    return [...document.querySelectorAll('a.hfpxzc[href*="/maps/place/"]')]
      .find((anchor) => anchor.href && anchor.href.startsWith(url));
  }

  async function waitForPlaceDetails(previousTitle = '') {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const title = textFrom(document.querySelector('h1.DUwDvf'));
      if (title && title !== previousTitle) return true;
      await sleep(200);
    }
    return Boolean(document.querySelector('h1.DUwDvf'));
  }

  function getDetailButtonText(selectors, labels = []) {
    const element = document.querySelector(selectors);
    const aria = normalizeText(element?.getAttribute('aria-label') || '');
    const text = aria || textFrom(element);
    return cleanLabeledText(text, labels);
  }

  function extractWebsite() {
    const websiteLink = document.querySelector([
      '#pane a[data-item-id="authority"]',
      '#pane a[aria-label*="Website" i]',
      '#pane a[aria-label*="Site" i]',
      '#pane a[href^="http"]:not([href*="google."]):not([href*="gstatic."])',
    ].join(','));

    return websiteLink?.href || '';
  }

  function extractRatingAndReviews() {
    const panelText = textFrom(document.querySelector('#pane'));
    const ratingNode = document.querySelector('#pane div.F7nice span[aria-hidden="true"]');
    const ratingText = textFrom(ratingNode) || panelText.match(/\b\d[,.]\d\b/)?.[0] || '';
    const reviewsText = panelText.match(/([\d.,]+)\s*(avaliações|reviews)/i)?.[1] || '';

    return {
      rating: ratingText.replace(',', '.'),
      reviews: reviewsText.replace(/\D/g, ''),
    };
  }

  function extractSpecialties() {
    const categories = [
      ...document.querySelectorAll('#pane button.DkEaL, #pane button[jsaction*="category"], #pane [data-item-id*="category"]'),
    ]
      .map(textFrom)
      .filter(Boolean);

    return [...new Set(categories)].join(', ');
  }

  function extractCurrentLead(index) {
    const name = textFrom(document.querySelector('h1.DUwDvf'));
    const phoneRaw = getDetailButtonText([
      '#pane button[data-item-id^="phone"]',
      '#pane div[role="button"][data-item-id^="phone"]',
      '#pane a[href^="tel:"]',
    ].join(','), ['Telefone', 'Phone']);
    const address = getDetailButtonText([
      '#pane button[data-item-id="address"]',
      '#pane div[role="button"][data-item-id="address"]',
      '#pane button[aria-label*="Endereço" i]',
      '#pane button[aria-label*="Address" i]',
    ].join(','), ['Endereço', 'Address']);
    const { rating, reviews } = extractRatingAndReviews();

    return {
      idx: index,
      nome_empresa: name,
      telefone: formatBrazilianPhone(phoneRaw),
      endereco: address,
      website: extractWebsite(),
      rating,
      reviews,
      especialidades: extractSpecialties(),
    };
  }

  async function openResult(url) {
    const previousTitle = textFrom(document.querySelector('h1.DUwDvf'));
    const anchor = findResultAnchorByUrl(url);

    if (!anchor) return false;

    anchor.scrollIntoView({ block: 'center' });
    await sleep(180);
    anchor.click();
    await waitForPlaceDetails(previousTitle);
    await sleep(500);
    return true;
  }

  async function returnToResults(searchUrl) {
    if (SEARCH_PATH_RE.test(location.href)) return;

    history.back();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (SEARCH_PATH_RE.test(location.href) || document.querySelector('a.hfpxzc[href*="/maps/place/"]')) break;
      await sleep(200);
    }

    if (!SEARCH_PATH_RE.test(location.href) && searchUrl) {
      history.pushState(null, '', searchUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
      await sleep(600);
    }
  }

  async function extractLeadsFromResults() {
    const searchUrl = location.href;
    const feed = await waitForResultsPanel();

    if (!feed && !document.querySelector('a.hfpxzc[href*="/maps/place/"]')) {
      throw new Error('Painel não encontrado. Abortando.');
    }

    await scrollResultsToEnd(feed);
    const urls = collectResultUrls();
    log('Cards únicos para extrair:', urls.length);

    const leads = [];
    const seenNames = new Set();

    for (let index = 0; index < urls.length; index += 1) {
      try {
        const opened = await openResult(urls[index]);
        if (!opened) continue;

        const lead = extractCurrentLead(leads.length + 1);
        if (lead.nome_empresa && !seenNames.has(lead.nome_empresa)) {
          seenNames.add(lead.nome_empresa);
          leads.push(lead);
        }

        await returnToResults(searchUrl);
        await sleep(350);
      } catch (error) {
        log('Erro ao extrair', index + 1, error?.message || error);
      }
    }

    return leads;
  }

  function closeModal(backdrop) {
    backdrop?.remove();
  }

  async function openSendModal(leadCount) {
    ensureStyles();
    document.getElementById('gmapsx-send-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'gmapsx-send-backdrop';
    backdrop.className = 'gmapsx-backdrop';

    const modal = document.createElement('div');
    modal.className = 'gmapsx-modal';
    modal.innerHTML = `
      <header>
        <h3>Enviar para Webhook</h3>
        <button class="close" aria-label="Fechar">×</button>
      </header>
      <div class="body">
        <div style="margin-bottom:8px;color:#9aa4b2">Foram coletados <b>${leadCount}</b> leads. Informe seu webhook para enviar agora.</div>
        <label for="gmapsx-input">URL do webhook</label>
        <input id="gmapsx-input" type="text" placeholder="https://seu-dominio.com/webhook/receber">
      </div>
      <div class="actions">
        <button class="gmapsx-btn" id="gmapsx-cancel">Cancelar</button>
        <button class="gmapsx-btn primary" id="gmapsx-send">Enviar</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const input = modal.querySelector('#gmapsx-input');
    const closeButton = modal.querySelector('.close');
    const cancelButton = modal.querySelector('#gmapsx-cancel');
    const sendButton = modal.querySelector('#gmapsx-send');
    const savedWebhook = await getSavedWebhook();

    if (savedWebhook) input.value = savedWebhook;
    setTimeout(() => input.focus(), 50);

    const close = () => closeModal(backdrop);
    closeButton.onclick = close;
    cancelButton.onclick = close;
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });

    sendButton.onclick = async () => {
      const webhookUrl = input.value.trim();
      if (!webhookUrl) {
        showToast('Informe uma URL de webhook.', false);
        input.focus();
        return;
      }

      if (!isValidWebhookUrl(webhookUrl)) {
        showToast('URL inválida.', false);
        input.focus();
        return;
      }

      const leads = await getSavedLeads();
      if (!leads.length) {
        showToast('Nenhum lead salvo para enviar.', false);
        return;
      }

      sendButton.disabled = true;
      sendButton.textContent = 'Enviando…';

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leads),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        await saveWebhook(webhookUrl);
        showToast(`Enviado com sucesso (${leads.length})!`);
        close();
        await saveLeads([]);
      } catch (error) {
        log('Falha ao enviar webhook:', error?.message || error);
        showToast('Falha ao enviar (verifique CORS/URL).', false);
      } finally {
        sendButton.disabled = false;
        sendButton.textContent = 'Enviar';
      }
    };
  }

  async function runExtraction() {
    try {
      ensureStyles();
      log('content.js iniciado em /maps/search/.');

      const leads = await extractLeadsFromResults();
      if (!leads.length) {
        showToast('Nenhum lead encontrado.', false);
        return;
      }

      await saveLeads(leads);
      showToast(`Extração concluída (${leads.length})!`);
      await openSendModal(leads.length);
    } catch (error) {
      log(error?.message || error);
      showToast(error?.message || 'Erro ao extrair leads.', false);
    }
  }

  runExtraction();
})();
