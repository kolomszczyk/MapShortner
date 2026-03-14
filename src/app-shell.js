let startupUpdateOverlay = null;
let updateAnnouncementOverlay = null;

const APP_LAST_SEEN_VERSION_STORAGE_KEY = 'app:lastSeenVersion';
// TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET: remove this one-off upgrade reset after 0.5.2 rollout.
const TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET_FROM_VERSION = '0.5.1';
// TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET: remove this one-off upgrade reset after 0.5.2 rollout.
const TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET_TO_VERSION = '0.5.2';
// TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET: remove this one-off upgrade reset after 0.5.2 rollout.
const TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET_APPLIED_KEY = 'app:tempRendererReset:0.5.2';
// TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET: remove this one-off upgrade reset after 0.5.2 rollout.
const TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET_KEYS = Object.freeze([
  'map:lastOpenedPanelState',
  'map:dateFilterState',
  'map:personSearchQuery',
  'map:timeColorDateMatchMode',
  'map:timeColorRanges'
]);

applyTemporaryRendererResetFor_0_5_2();

async function dismissStartupUpdateOverlay() {
  const overlay = ensureStartupUpdateOverlay();
  overlay.skipButton.disabled = true;
  overlay.closeButton.disabled = true;

  try {
    await window.appApi.skipStartupUpdate();
    overlay.manuallyClosed = false;
  } finally {
    overlay.skipButton.disabled = false;
    overlay.closeButton.disabled = false;
  }
}

async function dismissUpdateAnnouncementOverlay() {
  const overlay = ensureUpdateAnnouncementOverlay();
  overlay.closeButton.disabled = true;

  try {
    await window.appApi.hideUpdateAnnouncement();
  } finally {
    overlay.closeButton.disabled = false;
  }
}

function applyTemporaryRendererResetFor_0_5_2() {
  // TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET: remove this one-off upgrade reset after 0.5.2 rollout.
  const currentVersion = String(window.appApi?.runtimeMeta?.version || '').trim();
  if (!currentVersion) {
    return;
  }

  try {
    const lastSeenVersion = String(window.localStorage.getItem(APP_LAST_SEEN_VERSION_STORAGE_KEY) || '').trim();
    const alreadyApplied =
      window.localStorage.getItem(TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET_APPLIED_KEY) === 'true';
    const shouldApplyReset =
      !alreadyApplied
      && lastSeenVersion === TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET_FROM_VERSION
      && currentVersion === TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET_TO_VERSION;

    if (shouldApplyReset) {
      TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET_KEYS.forEach((key) => {
        window.localStorage.removeItem(key);
      });
      window.localStorage.setItem(TEMP_REMOVE_AFTER_0_5_2_RENDERER_RESET_APPLIED_KEY, 'true');
    }

    window.localStorage.setItem(APP_LAST_SEEN_VERSION_STORAGE_KEY, currentVersion);
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }
}

export function initShell(pageId) {
  document.body.dataset.page = pageId;
  bindHiddenDashboardShortcut(pageId);

  const navLinks = document.querySelectorAll('[data-page-link]');
  for (const link of navLinks) {
    if (link.dataset.pageLink === pageId) {
      link.classList.add('is-active');
    }
  }

  const updaterStatusEl = document.querySelector('[data-updater-status]');
  const operationStatusEl = document.querySelector('[data-operation-status]');

  if (updaterStatusEl) {
    window.appApi.onUpdateStatus((message) => {
      updaterStatusEl.textContent = message;
    });
  }

  window.appApi.onUpdaterState((state) => {
    if (updaterStatusEl && state?.message) {
      updaterStatusEl.textContent = state.message;
    }
    syncStartupUpdateOverlay(state);
    syncUpdateAnnouncementOverlay(state);
  });

  void window.appApi
    .getUpdaterState()
    .then((state) => {
      if (updaterStatusEl && state?.message) {
        updaterStatusEl.textContent = state.message;
      }
      syncStartupUpdateOverlay(state);
      syncUpdateAnnouncementOverlay(state);
    })
    .catch(() => {});

  if (operationStatusEl) {
    window.appApi.onOperationStatus((payload) => {
      operationStatusEl.textContent = payload?.message || 'Brak aktywnej operacji.';
      if (payload?.summary) {
        applySummary(payload.summary);
      }
    });
  }
}

function ensureStartupUpdateOverlay() {
  if (startupUpdateOverlay) {
    return startupUpdateOverlay;
  }

  const layer = document.createElement('div');
  layer.className = 'startup-update-layer';
  layer.hidden = true;
  layer.innerHTML = `
    <div class="startup-update-card" role="dialog" aria-modal="true" aria-labelledby="startup-update-title">
      <span class="startup-update-kicker">Start aplikacji</span>
      <h2 id="startup-update-title" class="startup-update-title"></h2>
      <p class="startup-update-copy"></p>
      <div class="startup-update-progress" hidden>
        <div class="startup-update-progress-bar"></div>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 18px; justify-content: flex-end;">
        <button type="button" class="startup-update-close" style="background: var(--button-muted, #eee); color: var(--text);">Zamknij</button>
        <button type="button" class="startup-update-skip">Pomiń tym razem</button>
      </div>
    </div>
  `;

  document.body.appendChild(layer);

  const skipButton = layer.querySelector('.startup-update-skip');
  const closeButton = layer.querySelector('.startup-update-close');

  let manuallyClosed = false;

  layer.addEventListener('mousedown', (e) => {
    if (e.target === layer && !skipButton.hidden && !skipButton.disabled) {
      void dismissStartupUpdateOverlay();
    }
  });

  closeButton.addEventListener('click', () => {
    if (closeButton.disabled || closeButton.hidden) {
      return;
    }

    if (!skipButton.hidden) {
      void dismissStartupUpdateOverlay();
      return;
    }

    layer.hidden = true;
    layer.classList.remove('is-visible');
    manuallyClosed = true;
  });

  skipButton.addEventListener('click', async () => {
    if (skipButton.disabled || skipButton.hidden) {
      return;
    }

    await dismissStartupUpdateOverlay();
  });

  startupUpdateOverlay = {
    layer,
    title: layer.querySelector('.startup-update-title'),
    copy: layer.querySelector('.startup-update-copy'),
    progress: layer.querySelector('.startup-update-progress'),
    progressBar: layer.querySelector('.startup-update-progress-bar'),
    skipButton,
    closeButton,
    get manuallyClosed() { return manuallyClosed; },
    set manuallyClosed(val) { manuallyClosed = val; }
  };

  return startupUpdateOverlay;
}

function ensureUpdateAnnouncementOverlay() {
  if (updateAnnouncementOverlay) {
    return updateAnnouncementOverlay;
  }

  const layer = document.createElement('div');
  layer.className = 'update-announcement-layer';
  layer.hidden = true;
  layer.innerHTML = `
    <div class="update-announcement-card" role="dialog" aria-modal="true" aria-labelledby="update-announcement-title">
      <span class="update-announcement-kicker">Nowa wersja</span>
      <h2 id="update-announcement-title" class="update-announcement-title"></h2>
      <p class="update-announcement-version"></p>
      <div class="update-announcement-copy"></div>
      <div class="update-announcement-actions">
        <button type="button" class="button-muted update-announcement-close">Zamknij</button>
      </div>
    </div>
  `;

  document.body.appendChild(layer);

  const closeButton = layer.querySelector('.update-announcement-close');

  layer.addEventListener('mousedown', (event) => {
    if (event.target === layer && !closeButton.disabled) {
      void dismissUpdateAnnouncementOverlay();
    }
  });

  closeButton.addEventListener('click', async () => {
    if (closeButton.disabled) {
      return;
    }

    await dismissUpdateAnnouncementOverlay();
  });

  updateAnnouncementOverlay = {
    layer,
    title: layer.querySelector('.update-announcement-title'),
    version: layer.querySelector('.update-announcement-version'),
    copy: layer.querySelector('.update-announcement-copy'),
    closeButton
  };

  return updateAnnouncementOverlay;
}

function getStartupUpdateTitle(state) {
  switch (state?.phase) {
    case 'checking':
      return 'Sprawdzanie aktualizacji';
    case 'downloading':
      return state?.version ? `Pobieranie ${state.version}` : 'Pobieranie aktualizacji';
    case 'downloaded':
      return 'Aktualizacja gotowa';
    case 'installing':
      return 'Instalowanie aktualizacji';
    case 'up-to-date':
      return 'Aplikacja jest aktualna';
    case 'error':
      return 'Aktualizacja niedostepna';
    default:
      return 'Aktualizacja aplikacji';
  }
}

function syncStartupUpdateOverlay(state) {
  const overlay = ensureStartupUpdateOverlay();
  let isVisible = Boolean(state?.visible);
  // Jeśli overlay został zamknięty ręcznie, nie pokazuj go ponownie w tej sesji
  if (isVisible && overlay.manuallyClosed) {
    isVisible = false;
  }
  overlay.layer.hidden = !isVisible;
  overlay.layer.classList.toggle('is-visible', isVisible);
  overlay.manuallyClosed = overlay.manuallyClosed || false;
  if (!isVisible) {
    return;
  }

  overlay.title.textContent = getStartupUpdateTitle(state);
  overlay.copy.textContent = state?.message || 'Sprawdzanie statusu aktualizacji.';

  const shouldShowProgress =
    state?.phase === 'checking' ||
    state?.phase === 'downloading' ||
    state?.phase === 'downloaded' ||
    state?.phase === 'installing';

  overlay.progress.hidden = !shouldShowProgress;
  overlay.progress.classList.toggle('is-indeterminate', state?.phase === 'checking');

  let progressWidth = '100%';
  if (state?.phase === 'checking') {
    progressWidth = '36%';
  } else if (state?.phase === 'downloading') {
    const clamped = Math.max(6, Math.min(100, Number(state?.progressPercent || 0)));
    progressWidth = `${clamped}%`;
  }
  overlay.progressBar.style.width = progressWidth;

  overlay.skipButton.hidden = !state?.canSkip;
  overlay.closeButton.hidden = !state?.canSkip;
}

function syncUpdateAnnouncementOverlay(state) {
  const overlay = ensureUpdateAnnouncementOverlay();
  const isVisible = Boolean(state?.announcementVisible && state?.announcementAvailable);

  overlay.layer.hidden = !isVisible;
  overlay.layer.classList.toggle('is-visible', isVisible);
  if (!isVisible) {
    return;
  }

  overlay.title.textContent = state?.announcementTitle || 'Nowa wersja aplikacji';
  overlay.version.textContent = state?.announcementVersion
    ? `Wersja: ${state.announcementVersion}`
    : 'Wersja oczekuje na potwierdzenie.';
  overlay.version.hidden = !overlay.version.textContent;
  overlay.copy.textContent = state?.announcementMessage || 'Dostepna jest nowa wersja aplikacji.';
}

function bindHiddenDashboardShortcut(pageId) {
  window.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) {
      return;
    }

    if (event.key.toLowerCase() !== 'd' || pageId === 'dashboard') {
      return;
    }

    event.preventDefault();
    window.location.href = './index.html';
  });
}

export function formatDate(value) {
  if (!value) {
    return 'Brak';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Brak';
  }
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) {
    return 'Brak';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Brak';
  }
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatMoney(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return 'Brak';
  }
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    maximumFractionDigits: 2
  }).format(Number(value));
}

export function formatNumber(value) {
  return new Intl.NumberFormat('pl-PL').format(Number(value || 0));
}

export function escapeHtml(value) {
  return normalizeNbspEntities(String(value ?? ''))
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function joinPresent(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function summarizePath(value) {
  if (!value) {
    return 'Otwórz w Accesie';
  }
  return value.length > 72 ? `${value.slice(0, 40)} ... ${value.slice(-24)}` : value;
}

export function applySummary(summary) {
  const map = {
    totalTables: summary?.stats?.totalTables,
    totalRows: summary?.stats?.totalRows,
    totalPeople: summary?.stats?.totalPeople,
    geocodedPeople: summary?.stats?.geocodedPeople,
    pendingGeocodes: summary?.stats?.pendingGeocodes,
    totalServiceCards: summary?.stats?.totalServiceCards,
    totalNotes: summary?.stats?.totalNotes,
    totalCustomPoints: summary?.stats?.totalCustomPoints
  };

  Object.entries(map).forEach(([key, value]) => {
    const target = document.querySelector(`[data-stat="${key}"]`);
    if (target) {
      target.textContent = formatNumber(value || 0);
    }
  });

  const importDateEl = document.querySelector('[data-imported-at]');
  if (importDateEl) {
    importDateEl.textContent = summary?.importMeta?.imported_at
      ? formatDateTime(summary.importMeta.imported_at)
      : 'Jeszcze nie importowano';
  }

  const sourcePathEl = document.querySelector('[data-access-path]');
  if (sourcePathEl) {
    sourcePathEl.textContent = summarizePath(
      summary?.settings?.accessDbPath || summary?.importMeta?.source_path
    );
  }
}

export function setButtonBusy(button, busy, busyLabel) {
  if (!button) {
    return;
  }
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent;
  }
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
}

export function renderKeyValueList(items) {
  const normalizeClassName = (value) => String(value || '')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => /^[a-z0-9_-]+$/i.test(token));

  return items
    .map(
      (item) => {
        const rowClasses = ['kv-row', ...normalizeClassName(item.rowClassName)].join(' ');
        const isNotesRow = rowClasses.includes('kv-row-notes');

        if (isNotesRow) {
          return `
        <div class="${rowClasses}">
          <div class="kv-notes-label">${escapeHtml(item.label)}</div>
          <div class="kv-notes-text">${escapeHtml(item.value ?? 'Brak')}</div>
        </div>
      `;
        }

        return `
        <div class="${rowClasses}">
          <span class="kv-label">${escapeHtml(item.label)}</span>
          <span class="kv-value">${escapeHtml(item.value ?? 'Brak')}</span>
        </div>
      `;
      }
    )
    .join('');
}

export function pickRecordValue(record, candidateKeys) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const entries = Object.entries(record);
  const exactMatches = new Map(
    entries.map(([key, value]) => [normalizeLookupKey(key), value])
  );

  for (const candidateKey of candidateKeys) {
    const matchedValue = exactMatches.get(normalizeLookupKey(candidateKey));
    if (!isLookupValueEmpty(matchedValue)) {
      return matchedValue;
    }
  }

  for (const candidateKey of candidateKeys) {
    const normalizedCandidate = normalizeLookupKey(candidateKey);
    const match = entries.find(([key, value]) => {
      if (isLookupValueEmpty(value)) {
        return false;
      }

      const normalizedKey = normalizeLookupKey(key);
      return normalizedKey.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedKey);
    });

    if (match) {
      return match[1];
    }
  }

  return null;
}

export function renderRecordFields(record, options = {}) {
  const entries = Object.entries(record || {});
  const includeEmpty = options.includeEmpty !== false;
  const items = entries
    .filter(([label, value]) => label && (includeEmpty || !isRecordValueEmpty(value)))
    .map(([label, value]) => ({
      label,
      value: formatRecordValue(value, label),
      rowClassName: isNotesLabel(label) ? 'kv-row-notes' : ''
    }));

  return items.length > 0 ? renderKeyValueList(items) : '';
}

export function formatRecordValue(value, label = '') {
  if (isRecordValueEmpty(value)) {
    return 'Brak';
  }

  if (typeof value === 'boolean') {
    return value ? 'Tak' : 'Nie';
  }

  if (typeof value === 'number') {
    return isMoneyLabel(label) ? formatMoney(value) : String(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map((entry) => formatRecordValue(entry, label)).join(', ')
      : 'Brak';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  const normalizedValue = String(value).trim();
  if (!normalizedValue) {
    return 'Brak';
  }

  const shouldExpandNotesLineBreaks = isNotesLabel(label);

  if (looksLikeIsoDate(normalizedValue)) {
    return formatDate(normalizedValue);
  }

  if (looksLikeHtml(normalizedValue)) {
    return stripHtml(normalizedValue, {
      preserveLineBreaks: shouldExpandNotesLineBreaks,
      doubleLineBreaks: shouldExpandNotesLineBreaks
    }) || 'Brak';
  }

  if (shouldExpandNotesLineBreaks) {
    return formatTextWithPreservedLineBreaks(normalizedValue, { doubleLineBreaks: true }) || 'Brak';
  }

  return normalizedValue.replace(/\s+/g, ' ');
}

function normalizeLookupKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function isLookupValueEmpty(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function isRecordValueEmpty(value) {
  if (value == null) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0 || value.every((entry) => isRecordValueEmpty(entry));
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  return false;
}

function normalizeRecordLabel(label) {
  return String(label || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isMoneyLabel(label) {
  const normalizedLabel = normalizeRecordLabel(label);
  return normalizedLabel.includes('kwota') || normalizedLabel.includes('suma wplat');
}

function isNotesLabel(label) {
  const normalizedLabel = normalizeRecordLabel(label);
  return normalizedLabel.includes('uwag');
}

function looksLikeIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}(t|\s|$)/i.test(value);
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function formatTextWithPreservedLineBreaks(value, options = {}) {
  const doubleLineBreaks = options.doubleLineBreaks === true;
  const separator = doubleLineBreaks ? '\n\n' : '\n';
  const lines = normalizeNbspEntities(String(value || ''))
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);

  return lines.join(separator);
}

function stripHtml(value, options = {}) {
  const preserveLineBreaks = options.preserveLineBreaks === true;
  const doubleLineBreaks = options.doubleLineBreaks === true;
  const container = document.createElement('div');
  container.innerHTML = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, '\n');

  const textContent = container.textContent || container.innerText || '';
  if (preserveLineBreaks) {
    return formatTextWithPreservedLineBreaks(textContent, { doubleLineBreaks });
  }

  return textContent.replace(/\s+/g, ' ').trim();
}

function normalizeNbspEntities(value) {
  return String(value || '').replace(/&nbsp;|&#160;|&#xA0;/gi, '\u00A0');
}
