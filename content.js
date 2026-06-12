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

  let stylesPromise = null;

  function injectStyleSheet(css) {
    if (document.getElementById('gmaps-extractor-style')) return;

    const style = document.createElement('style');
    style.id = 'gmaps-extractor-style';
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function loadStylesheetViaLink() {
    return new Promise((resolve, reject) => {
      if (document.getElementById('gmaps-extractor-style')) {
        resolve();
        return;
      }

      const link = document.createElement('link');
      link.id = 'gmaps-extractor-style';
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('global.css');
      link.onload = () => resolve();
      link.onerror = () => reject(new Error('Failed to load global.css via link'));
      document.documentElement.appendChild(link);
    });
  }

  function ensureStyles() {
    if (document.getElementById('gmaps-extractor-style')) {
      return Promise.resolve();
    }

    if (!stylesPromise) {
      stylesPromise = (async () => {
        const url = chrome.runtime.getURL('global.css');

        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          injectStyleSheet(await response.text());
          return;
        } catch (error) {
          log('Failed to fetch global.css:', error?.message || error);
        }

        try {
          await loadStylesheetViaLink();
        } catch (error) {
          log('Failed to load global.css via link:', error?.message || error);
          throw error;
        }
      })().catch((error) => {
        stylesPromise = null;
        throw error;
      });
    }

    return stylesPromise;
  }

  async function showToast(message, ok = true) {
    try {
      await ensureStyles();
    } catch (error) {
      log('Toast without stylesheet:', error?.message || error);
    }

    let toast = document.getElementById('extract-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'extract-toast';
      toast.className = 'extract-toast';
      document.body.appendChild(toast);
    }

    toast.classList.toggle('success', ok);
    toast.classList.toggle('error', !ok);
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  async function openExtractionGame() {
    await ensureStyles();
    document.getElementById('extract-game-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'extract-game-backdrop';
    backdrop.innerHTML = `
      <div class="extract-game-modal" role="dialog" aria-modal="true" aria-label="Extracting leads">
        <h3>Extracting leads...</h3>
        <p class="extract-game-subtitle">While we collect contacts, jump obstacles to pass the time.</p>
        <div class="extract-game-stage" tabindex="0">
          <div class="extract-game-ground"></div>
          <div class="extract-game-runner" aria-hidden="true">
            <span class="extract-cat-tail"></span>
            <span class="extract-cat-body"></span>
            <span class="extract-cat-head"></span>
            <span class="extract-cat-face"></span>
            <span class="extract-cat-leg back"></span>
            <span class="extract-cat-leg front"></span>
          </div>
          <div class="extract-game-over" hidden>
            <strong>Game over</strong>
            <span>Press Space or click to restart</span>
          </div>
        </div>
        <div class="extract-game-score">
          <span>Score: <b data-score>0</b></span>
          <span class="extract-game-hint">Space, ↑ or click to jump</span>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const stage = backdrop.querySelector('.extract-game-stage');
    const modal = backdrop.querySelector('.extract-game-modal');
    const runner = backdrop.querySelector('.extract-game-runner');
    const score = backdrop.querySelector('[data-score]');
    const gameOverMessage = backdrop.querySelector('.extract-game-over');
    const obstacles = new Set();
    const timers = new Set();
    let points = 0;
    let closed = false;
    let gameOver = false;
    let jumping = false;

    const addTimer = (callback, delay, repeat = false) => {
      const timer = repeat ? setInterval(callback, delay) : setTimeout(callback, delay);
      timers.add({ timer, repeat });
      return timer;
    };

    const stopTimers = () => {
      for (const { timer, repeat } of timers) {
        if (repeat) clearInterval(timer);
        else clearTimeout(timer);
      }
      timers.clear();
    };

    const hasCollision = (obstacle) => {
      const runnerBox = runner.getBoundingClientRect();
      const obstacleBox = obstacle.getBoundingClientRect();
      const runnerHitbox = {
        left: runnerBox.left + 14,
        right: runnerBox.right - 10,
        top: runnerBox.top + 8,
        bottom: runnerBox.bottom,
      };
      const obstacleHitbox = {
        left: obstacleBox.left + 2,
        right: obstacleBox.right - 2,
        top: obstacleBox.top + 3,
        bottom: obstacleBox.bottom,
      };
      return !(
        runnerHitbox.right < obstacleHitbox.left ||
        runnerHitbox.left > obstacleHitbox.right ||
        runnerHitbox.bottom < obstacleHitbox.top ||
        runnerHitbox.top > obstacleHitbox.bottom
      );
    };

    const setGameOver = () => {
      gameOver = true;
      jumping = false;
      runner.classList.remove('jump');
      modal.classList.add('game-over');
      gameOverMessage.hidden = false;
      stopTimers();
    };

    const startSpawning = () => {
      addTimer(spawnObstacle, 1200);
      addTimer(spawnObstacle, 3800, true);
    };

    const restartGame = () => {
      if (closed) return;

      stopTimers();
      for (const obstacle of obstacles) obstacle.remove();
      obstacles.clear();
      points = 0;
      score.textContent = '0';
      gameOver = false;
      jumping = false;
      modal.classList.remove('game-over');
      gameOverMessage.hidden = true;
      runner.classList.remove('jump');
      startSpawning();
    };

    const jump = () => {
      if (jumping || closed || gameOver) return;
      jumping = true;
      runner.classList.add('jump');
      addTimer(() => {
        runner.classList.remove('jump');
        jumping = false;
      }, 780);
    };

    const spawnObstacle = () => {
      if (closed || gameOver) return;

      const obstacle = document.createElement('div');
      obstacle.className = 'extract-game-obstacle';
      stage.appendChild(obstacle);
      obstacles.add(obstacle);

      let x = stage.clientWidth + 28;
      const speed = 4.4 + Math.min(points / 120, 2.8);
      const move = setInterval(() => {
        if (closed || gameOver) {
          clearInterval(move);
          return;
        }

        x -= speed;
        obstacle.style.transform = `translateX(${-stage.clientWidth - 56 + x}px)`;

        if (hasCollision(obstacle)) {
          setGameOver();
          return;
        }

        if (x < -40) {
          clearInterval(move);
          obstacle.remove();
          obstacles.delete(obstacle);
          points += 1;
          score.textContent = String(points);
        }
      }, 24);

      timers.add({ timer: move, repeat: true });
    };

    const handleKeydown = (event) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault();
        if (gameOver) {
          restartGame();
          return;
        }
        jump();
      }
    };

    const handleClick = () => {
      if (gameOver) restartGame();
      else jump();
    };

    backdrop.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeydown);
    stage.focus();

    startSpawning();

    return {
      backdrop,
      close() {
        closed = true;
        for (const { timer, repeat } of timers) {
          if (repeat) clearInterval(timer);
          else clearTimeout(timer);
        }
        window.removeEventListener('keydown', handleKeydown);
        backdrop.removeEventListener('click', handleClick);
        for (const obstacle of obstacles) obstacle.remove();
        backdrop.remove();
      },
    };
  }

  function closeExtractionGame(game) {
    game?.close?.();
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

  function isGenericDetailText(text) {
    const cleaned = normalizeText(text);
    if (!cleaned) return true;
    if (/\d{2,}/.test(cleaned) && cleaned.length > 6) return false;

    if (/enviar para|send to|smartphone|smart phone|dispositivo móvel|mobile device|toque para|tap to/i.test(cleaned)) {
      return true;
    }

    return /^(telefone|phone|endereço|endereco|address|website|site|copiar telefone|copy phone|copiar|copy|ligar|call|rotas|directions|salvar|save|compartilhar|share)$/i.test(cleaned);
  }

  function phoneDigitsCount(value) {
    return String(value || '').replace(/\D/g, '').length;
  }

  function isPhoneActionLabel(text) {
    const cleaned = normalizeText(text);
    if (!cleaned) return true;
    if (phoneDigitsCount(cleaned) >= 10) return false;

    return /enviar para|send to|smartphone|smart phone|copiar|copy|ligar|call|toque para|tap to/i.test(cleaned);
  }

  function extractPhoneDigitsFromText(text) {
    const cleaned = normalizeText(text);
    if (!cleaned || isPhoneActionLabel(cleaned)) return '';

    const labeled = cleaned.match(/(?:telefone|phone)\s*:?\s*(.+)$/i);
    const source = labeled ? labeled[1] : cleaned;
    if (isPhoneActionLabel(source)) return '';

    return phoneDigitsCount(source) >= 10 ? source : '';
  }

  function getPlaceTitle() {
    return document.querySelector('h1.DUwDvf, h1[role="heading"]');
  }

  function getPlaceDetailRoot() {
    const title = getPlaceTitle();
    if (!title) return document.querySelector('#pane') || document.body;

    let node = title.parentElement;
    while (node && node !== document.body) {
      const hasDetailRows = node.querySelector([
        '[data-item-id="address"]',
        '[data-item-id^="phone"]',
        '[data-item-id="authority"]',
      ].join(','));
      if (hasDetailRows) return node;
      node = node.parentElement;
    }

    const pane = document.querySelector('#pane');
    if (pane?.contains(title)) return pane;

    return title.closest('[role="main"]') || pane || document.body;
  }

  function queryAllInDetailRoot(selector) {
    return [...getPlaceDetailRoot().querySelectorAll(selector)];
  }

  function scrollDetailRoot() {
    const root = getPlaceDetailRoot();
    const scrollable = root.closest('.m6QErb') || root;
    if (scrollable.scrollHeight <= scrollable.clientHeight + 10) return;

    scrollable.scrollTop = 0;
    scrollable.scrollTop = Math.floor(scrollable.scrollHeight / 2);
    scrollable.scrollTop = scrollable.scrollHeight;
  }

  function hasPhoneRowInDetail() {
    const root = getPlaceDetailRoot();
    return Boolean(root.querySelector([
      '[data-item-id^="phone"]',
      '[data-item-id*="phone:tel"]',
      'a[href^="tel:"]',
      'button[aria-label*="Telefone" i]',
      'button[aria-label*="Phone" i]',
    ].join(',')));
  }

  function visibleValueFromElement(element) {
    if (!element) return '';

    const visibleNode = element.querySelector('.Io6YTe, .fontBodyMedium');
    const visibleText = textFrom(visibleNode);
    if (visibleText && !isGenericDetailText(visibleText)) return visibleText;

    return '';
  }

  function parsePhoneFromDataItemId(value) {
    const itemId = normalizeText(value);
    if (!itemId) return '';

    const telMatch = itemId.match(/phone:tel:([^;]+)/i);
    if (telMatch) return normalizeText(decodeURIComponent(telMatch[1]));

    return '';
  }

  function detailTextFromElement(element, labels = []) {
    if (!element) return '';

    const visible = visibleValueFromElement(element);
    if (visible) return visible;

    const href = element.getAttribute('href') || '';
    if (href.startsWith('tel:')) {
      return normalizeText(decodeURIComponent(href.replace(/^tel:/i, '')));
    }

    const fromItemId = parsePhoneFromDataItemId(element.getAttribute('data-item-id'));
    if (fromItemId) return fromItemId;

    const attrs = [
      element.getAttribute('aria-label'),
      element.getAttribute('data-tooltip'),
      element.getAttribute('title'),
      element.getAttribute('data-value'),
      element.getAttribute('href'),
      textFrom(element),
    ];

    for (const attr of attrs) {
      const text = cleanLabeledText(attr, labels);
      if (text && !isGenericDetailText(text)) return text;
    }

    return '';
  }

  function getDetailText(selectors, labels = []) {
    for (const element of queryAllInDetailRoot(selectors)) {
      const text = detailTextFromElement(element, labels);
      if (text) return text;
    }

    return '';
  }

  function countFilledLeadFields(lead) {
    return [
      lead.phone,
      lead.address,
      lead.website,
      lead.rating,
      lead.reviews,
      lead.specialties,
    ].filter(Boolean).length;
  }

  function normalizeBrazilPhoneDigits(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';

    while (digits.startsWith('55') && digits.length > 11) {
      digits = digits.slice(2);
    }

    if (digits.length === 12 && digits.startsWith('55')) {
      digits = digits.slice(2);
    }

    if (digits.length === 11 && digits.startsWith('0')) {
      digits = digits.slice(1);
    }

    if (digits.length === 12 && digits.startsWith('0')) {
      digits = digits.slice(1);
    }

    return digits.length === 10 || digits.length === 11 ? digits : '';
  }

  function isValidBrazilianDdd(ddd) {
    const code = Number.parseInt(ddd, 10);
    return code >= 11 && code <= 99;
  }

  function formatBrazilianPhone(value) {
    const digits = normalizeBrazilPhoneDigits(value);
    if (!digits) return '';

    const ddd = digits.slice(0, 2);
    if (!isValidBrazilianDdd(ddd)) return '';

    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }

    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }

    return '';
  }

  function extractPhone() {
    const root = getPlaceDetailRoot();

    const tryValue = (value) => {
      const source = extractPhoneDigitsFromText(value) || value;
      return formatBrazilianPhone(source);
    };

    const elements = [...root.querySelectorAll([
      'button[data-item-id^="phone"]',
      '[role="button"][data-item-id^="phone"]',
      'a[href^="tel:"]',
    ].join(','))];

    elements.sort((a, b) => {
      const score = (node) => {
        const itemId = node.getAttribute('data-item-id') || '';
        if (/phone:tel:/i.test(itemId)) return 3;
        if ((node.getAttribute('href') || '').startsWith('tel:')) return 2;
        if (node.querySelector('.Io6YTe')) return 1;
        return 0;
      };
      return score(b) - score(a);
    });

    for (const element of elements) {
      const fromItemId = parsePhoneFromDataItemId(element.getAttribute('data-item-id'));
      const hitFromId = tryValue(fromItemId);
      if (hitFromId) return hitFromId;

      const href = element.getAttribute('href') || '';
      if (href.startsWith('tel:')) {
        const hitFromHref = tryValue(decodeURIComponent(href.replace(/^tel:/i, '')));
        if (hitFromHref) return hitFromHref;
      }

      for (const io of element.querySelectorAll('.Io6YTe, .fontBodyMedium')) {
        const hitFromIo = tryValue(textFrom(io));
        if (hitFromIo) return hitFromIo;
      }

      const hitFromVisible = tryValue(visibleValueFromElement(element));
      if (hitFromVisible) return hitFromVisible;

      for (const attr of [
        element.getAttribute('aria-label'),
        element.getAttribute('data-tooltip'),
      ]) {
        const hitFromAttr = tryValue(cleanLabeledText(attr, ['Telefone', 'Phone', 'Copiar telefone', 'Copy phone']));
        if (hitFromAttr) return hitFromAttr;
      }
    }

    return '';
  }

  async function waitForPhoneNumber() {
    if (!hasPhoneRowInDetail()) return;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (extractPhone()) return;
      scrollDetailRoot();
      await sleep(300);
    }
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

  function normalizePlaceUrl(href) {
    try {
      const parsed = new URL(href, location.origin);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return String(href || '').split('&')[0].split('?')[0];
    }
  }

  function collectResultAnchors() {
    const feed = findScrollableFeed();
    const scope = feed || document.querySelector('#pane') || document;
    const seen = new Set();
    const anchors = [];

    for (const anchor of scope.querySelectorAll('a.hfpxzc[href*="/maps/place/"]')) {
      if (!anchor.href || isSponsoredResult(anchor)) continue;

      const key = normalizePlaceUrl(anchor.href);
      if (seen.has(key)) continue;

      seen.add(key);
      anchors.push(anchor);
    }

    return anchors;
  }

  function findResultAnchorByUrl(url) {
    const target = normalizePlaceUrl(url);
    return collectResultAnchors().find((anchor) => normalizePlaceUrl(anchor.href) === target);
  }

  function hasPlaceDetailsLoaded(previousTitle = '') {
    const title = textFrom(getPlaceTitle());
    if (!title || title === previousTitle) return false;

    const root = getPlaceDetailRoot();
    return Boolean(
      root.querySelector('[data-item-id="address"], [data-item-id^="phone"], a[href^="tel:"]')
    );
  }

  async function waitForPlaceDetails(previousTitle = '') {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (hasPlaceDetailsLoaded(previousTitle)) return true;
      await sleep(200);
    }

    return Boolean(getPlaceTitle());
  }

  function extractWebsite() {
    const root = getPlaceDetailRoot();
    const websiteLinks = root.querySelectorAll([
      'a[data-item-id="authority"]',
      'a[aria-label*="Website" i]',
      'a[aria-label*="Site" i]',
      'a[data-tooltip*="Website" i]',
      'a[data-tooltip*="Site" i]',
      'a[href^="http"]:not([href*="google."]):not([href*="gstatic."])',
    ].join(','));

    for (const link of websiteLinks) {
      const href = link.href || detailTextFromElement(link, ['Website', 'Site']);
      if (
        href &&
        /^https?:\/\//i.test(href) &&
        !/google\.|gstatic\.|ggpht\.|schema\.org|maps\.google/i.test(href)
      ) {
        return href;
      }
    }

    return '';
  }

  function extractRatingAndReviews() {
    const root = getPlaceDetailRoot();
    const panelText = textFrom(root);
    const ratingNode = root.querySelector([
      'motion.div.F7nice span[aria-hidden="true"]',
      'motion.div.F7nice',
      'motion.div.F7nice span',
      'span[aria-label*="estrelas" i]',
      'span[aria-label*="stars" i]',
    ].join(','));
    const ratingSource = detailTextFromElement(ratingNode) || panelText;
    const ratingText = ratingSource.match(/\b\d[,.]\d\b/)?.[0] || '';
    const reviewsText = panelText.match(/([\d.,]+)\s*(avaliações|avaliacoes|reviews|comentários|comentarios)/i)?.[1] || '';

    return {
      rating: ratingText.replace(',', '.'),
      reviews: reviewsText.replace(/\D/g, ''),
    };
  }

  function extractSpecialties() {
    const root = getPlaceDetailRoot();
    const categories = [
      ...root.querySelectorAll([
        'button.DkEaL',
        'button[jsaction*="category"]',
        'button[aria-label*="Categoria" i]',
        'button[aria-label*="Category" i]',
        '[data-item-id*="category"]',
      ].join(',')),
    ]
      .map((element) => detailTextFromElement(element, ['Categoria', 'Category']))
      .filter((category) => category && !/adicionar|add|editar|edit/i.test(category));

    return [...new Set(categories)].join(', ');
  }

  function hasUsefulLeadDetails(lead) {
    return countFilledLeadFields(lead) >= 2;
  }

  function isLeadReady(lead) {
    if (!lead.company_name) return false;
    if (hasPhoneRowInDetail() && !lead.phone) return false;
    return hasUsefulLeadDetails(lead);
  }

  function extractCurrentLead(index) {
    const root = getPlaceDetailRoot();
    const name = textFrom(getPlaceTitle());
    const phone = extractPhone();
    const address = getDetailText([
      'button[data-item-id="address"]',
      '[role="button"][data-item-id="address"]',
      'button[aria-label*="Endereço" i]',
      'button[aria-label*="Address" i]',
      '[role="button"][aria-label*="Endereço" i]',
      '[role="button"][aria-label*="Address" i]',
    ].join(','), ['Endereço', 'Address']);
    const { rating, reviews } = extractRatingAndReviews();

    const lead = {
      idx: index,
      company_name: name,
      phone,
      address,
      website: extractWebsite(),
      rating,
      reviews,
      specialties: extractSpecialties(),
    };

    log('Lead extracted:', lead.company_name, `(${countFilledLeadFields(lead)} fields)`, lead.phone ? `tel: ${lead.phone}` : 'no phone');
    return lead;
  }

  async function extractCurrentLeadWhenReady(index) {
    await waitForPhoneNumber();
    scrollDetailRoot();
    let bestLead = extractCurrentLead(index);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (isLeadReady(bestLead)) return bestLead;
      await sleep(320);
      scrollDetailRoot();

      const lead = extractCurrentLead(index);
      const leadScore = countFilledLeadFields(lead) + (lead.phone ? 2 : 0);
      const bestScore = countFilledLeadFields(bestLead) + (bestLead.phone ? 2 : 0);
      if (leadScore >= bestScore) bestLead = lead;
    }

    return bestLead;
  }

  async function openResultByAnchor(anchor, fallbackUrl = '') {
    const previousTitle = textFrom(getPlaceTitle());
    const placeUrl = fallbackUrl || anchor?.href || '';

    const waitForReady = async () => {
      await waitForPlaceDetails(previousTitle);
      await sleep(500);
      scrollDetailRoot();
      await sleep(350);
      await waitForPhoneNumber();
      return hasPlaceDetailsLoaded(previousTitle);
    };

    if (anchor) {
      anchor.scrollIntoView({ block: 'center' });
      await sleep(220);
      anchor.click();
      if (await waitForReady()) return true;
    }

    if (!placeUrl) return false;

    history.pushState(null, '', placeUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await sleep(900);
    return waitForReady();
  }

  async function openResult(url) {
    const anchor = findResultAnchorByUrl(url);
    return openResultByAnchor(anchor, url);
  }

  async function returnToResults(searchUrl) {
    if (!SEARCH_PATH_RE.test(location.href)) {
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

    await waitForResultsPanel();
    await sleep(400);
  }

  async function extractLeadsFromResults() {
    const searchUrl = location.href;
    const feed = await waitForResultsPanel();

    if (!feed && !document.querySelector('a.hfpxzc[href*="/maps/place/"]')) {
      throw new Error('Results panel not found. Aborting.');
    }

    await scrollResultsToEnd(feed);
    const allAnchors = collectResultAnchors();
    log('Cards to extract:', allAnchors.length);

    const leads = [];
    const seenNames = new Set();
    let cardIndex = 0;

    while (cardIndex < allAnchors.length) {
      const anchors = collectResultAnchors();
      if (cardIndex >= anchors.length) break;

      const anchor = anchors[cardIndex];
      const cardNumber = cardIndex + 1;
      cardIndex += 1;

      try {
        log(`Opening card ${cardNumber}/${anchors.length}:`, textFrom(anchor) || normalizePlaceUrl(anchor.href));

        let opened = await openResultByAnchor(anchor);
        if (!opened) {
          await returnToResults(searchUrl);
          const retryAnchors = collectResultAnchors();
          opened = await openResultByAnchor(retryAnchors[cardNumber - 1]);
        }
        if (!opened) {
          log('Could not open card', cardNumber);
          continue;
        }

        const lead = await extractCurrentLeadWhenReady(leads.length + 1);
        if (!lead.company_name) {
          log('Lead without name on card', cardNumber);
          await returnToResults(searchUrl);
          continue;
        }

        if (seenNames.has(lead.company_name)) {
          log('Duplicate name, skipping card', cardNumber, lead.company_name);
          await returnToResults(searchUrl);
          continue;
        }

        seenNames.add(lead.company_name);
        leads.push(lead);
        await returnToResults(searchUrl);
        await sleep(600);
      } catch (error) {
        log('Error extracting card', cardNumber, error?.message || error);
        await returnToResults(searchUrl);
      }
    }

    return leads;
  }

  function closeModal(backdrop) {
    backdrop?.remove();
  }

  async function openSendModal(leadCount) {
    await ensureStyles();
    document.getElementById('extract-send-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'extract-send-backdrop';
    backdrop.className = 'extract-backdrop';

    const modal = document.createElement('div');
    modal.className = 'extract-modal';
    modal.innerHTML = `
      <header>
        <h3>Send to Webhook</h3>
        <button class="close" aria-label="Close">×</button>
      </header>
      <div class="body">
        <div class="hint" style="margin-bottom:8px"><b>${leadCount}</b> leads collected. They will be sent to the webhook configured in the extension.</div>
        <label for="extract-input">Webhook URL</label>
        <input id="extract-input" type="text" readonly placeholder="No webhook configured">
      </div>
      <div class="actions">
        <button class="extract-btn ghost" id="extract-cancel"><span>Cancel</span></button>
        <button class="extract-btn primary" id="extract-send"><span>Send</span></button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const input = modal.querySelector('#extract-input');
    const closeButton = modal.querySelector('.close');
    const cancelButton = modal.querySelector('#extract-cancel');
    const sendButton = modal.querySelector('#extract-send');
    const savedWebhook = await getSavedWebhook();

    if (savedWebhook) {
      input.value = savedWebhook;
    } else {
      sendButton.disabled = true;
    }

    setTimeout(() => sendButton.focus(), 50);

    const close = () => closeModal(backdrop);
    closeButton.onclick = close;
    cancelButton.onclick = close;
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });

    sendButton.onclick = async () => {
      const webhookUrl = input.value.trim();
      if (!webhookUrl) {
        showToast('Configure the webhook in the extension before sending.', false);
        return;
      }

      if (!isValidWebhookUrl(webhookUrl)) {
        showToast('Invalid webhook configured. Update it in the extension.', false);
        return;
      }

      const leads = await getSavedLeads();
      if (!leads.length) {
        showToast('No saved leads to send.', false);
        return;
      }

      sendButton.disabled = true;
      sendButton.innerHTML = '<span>Sending…</span>';

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leads),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        await saveWebhook(webhookUrl);
        showToast(`Sent successfully (${leads.length})!`);
        close();
        await saveLeads([]);
      } catch (error) {
        log('Failed to send webhook:', error?.message || error);
        showToast('Failed to send (check CORS/URL).', false);
      } finally {
        sendButton.disabled = false;
        sendButton.innerHTML = '<span>Send</span>';
      }
    };
  }

  async function runExtraction() {
    let game = null;

    try {
      await ensureStyles();
      log('content.js started on /maps/search/.');

      game = await openExtractionGame();
      const leads = await extractLeadsFromResults();
      closeExtractionGame(game);
      game = null;

      if (!leads.length) {
        showToast('No leads found.', false);
        return;
      }

      await saveLeads(leads);
      showToast(`Extraction complete (${leads.length})!`);
      await openSendModal(leads.length);
    } catch (error) {
      closeExtractionGame(game);
      log(error?.message || error);
      showToast(error?.message || 'Error extracting leads.', false);
    }
  }

  runExtraction();
})();
