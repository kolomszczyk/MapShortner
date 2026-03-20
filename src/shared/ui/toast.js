export function ensureToastListElement(options = {}) {
  const selector = String(options.selector || '').trim();
  if (selector) {
    const existing = document.querySelector(selector);
    if (existing) {
      return existing;
    }
  }

  const host = options.host || document.body;
  if (!host) {
    return null;
  }

  const listElement = document.createElement('div');
  listElement.className = String(options.className || 'map-toast-list');

  const dataset = options.dataset || {};
  Object.entries(dataset).forEach(([key, value]) => {
    listElement.dataset[key] = String(value);
  });

  listElement.setAttribute('aria-live', String(options.ariaLive || 'polite'));
  listElement.setAttribute('aria-atomic', String(options.ariaAtomic || 'false'));
  host.appendChild(listElement);
  return listElement;
}

export function showToastMessage(options = {}) {
  const listElement = options.listElement;
  if (!listElement) {
    return;
  }

  const normalizedMessage = String(options.message || 'Wykonano akcje');
  const normalizedType = String(options.type || 'info').toLowerCase();
  const durationMs = Number.isFinite(options.durationMs)
    ? Math.max(800, Math.round(options.durationMs))
    : 2400;

  const toastItemEl = document.createElement('div');
  toastItemEl.className = 'map-toast';
  toastItemEl.setAttribute('role', 'status');

  if (normalizedType === 'error') {
    toastItemEl.classList.add('is-error');
  } else if (normalizedType === 'success') {
    toastItemEl.classList.add('is-success');
  } else {
    toastItemEl.classList.add('is-info');
  }

  const toastBodyEl = document.createElement('div');
  toastBodyEl.className = 'map-toast-body';

  const toastMessageEl = document.createElement('div');
  toastMessageEl.className = 'map-toast-message';
  toastMessageEl.textContent = normalizedMessage;
  toastBodyEl.append(toastMessageEl);

  toastItemEl.append(toastBodyEl);
  listElement.append(toastItemEl);

  if (Number.isFinite(options.maxItems) && options.maxItems > 0) {
    while (listElement.childElementCount > options.maxItems) {
      listElement.firstElementChild?.remove();
    }
  }

  window.requestAnimationFrame(() => {
    toastItemEl.classList.add('is-visible');
  });

  window.setTimeout(() => {
    toastItemEl.classList.remove('is-visible');
    window.setTimeout(() => {
      toastItemEl.remove();
    }, 220);
  }, durationMs);
}