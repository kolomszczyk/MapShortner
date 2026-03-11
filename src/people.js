import {
  applySummary,
  escapeHtml,
  formatDate,
  formatMoney,
  formatNumber,
  initShell,
  renderKeyValueList
} from './app-shell.js';

initShell('people');

const PEOPLE_SEARCH_BATCH_SIZE = 50;
const PEOPLE_SEARCH_SCROLL_THRESHOLD_PX = 120;
const PEOPLE_SEARCH_OVERSCAN_ROWS = 40;
const PEOPLE_SEARCH_ROW_GAP_PX = 10;
const PEOPLE_SEARCH_ESTIMATED_ROW_HEIGHT_PX = 108;

const searchInput = document.getElementById('people-search');
const resultsEl = document.getElementById('people-results');
const resultCountEl = document.getElementById('people-result-count');
const notesForm = document.getElementById('person-note-form');
const noteInput = document.getElementById('person-note-input');
const detailTitleEl = document.getElementById('person-detail-title');
const detailMetaEl = document.getElementById('person-detail-meta');
const serviceCardsEl = document.getElementById('person-service-cards');
const notesListEl = document.getElementById('person-notes');

let activePersonId = null;
let searchTimer = null;
let peopleSearchSessionId = 0;
let peopleVirtualFrame = 0;
let peopleVirtualRowHeight = PEOPLE_SEARCH_ESTIMATED_ROW_HEIGHT_PX;
let peopleSearchState = {
  query: '',
  items: [],
  total: 0,
  isLoading: false,
  hasLoaded: false,
  hasMore: false
};

window.appApi.onOperationStatus(async (payload) => {
  if (
    payload?.status === 'completed' &&
    (payload.type === 'import' || payload.type === 'trasa-import' || payload.type === 'geocoding')
  ) {
    await refreshPeopleSearch(searchInput.value);
  }
});

searchInput.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    void refreshPeopleSearch(searchInput.value);
  }, 160);
});

resultsEl.addEventListener('click', (event) => {
  const personButton = event.target.closest('[data-person-id]');
  if (!personButton) {
    return;
  }

  void loadPerson(personButton.getAttribute('data-person-id'));
});

resultsEl.addEventListener('scroll', () => {
  schedulePeopleVirtualRender();
  void maybeLoadMorePeople();
});

window.addEventListener('resize', () => {
  schedulePeopleVirtualRender();
  queuePeopleSearchAutofill();
});

notesForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activePersonId || !noteInput.value.trim()) {
    return;
  }

  await window.appApi.addNote({
    entityType: 'person',
    entityId: activePersonId,
    message: noteInput.value.trim()
  });
  noteInput.value = '';
  await loadPerson(activePersonId);
});

bootstrap();

async function bootstrap() {
  const bootstrapData = await window.appApi.getBootstrap();
  applySummary(bootstrapData.summary);
  await refreshPeopleSearch('');
}

async function refreshPeopleSearch(query) {
  peopleSearchSessionId += 1;
  const sessionId = peopleSearchSessionId;
  peopleSearchState = {
    query: String(query || ''),
    items: [],
    total: 0,
    isLoading: true,
    hasLoaded: false,
    hasMore: false
  };
  renderPeople();

  const response = await window.appApi.listPeople({
    query: peopleSearchState.query,
    limit: PEOPLE_SEARCH_BATCH_SIZE,
    offset: 0
  });

  if (sessionId !== peopleSearchSessionId) {
    return;
  }

  applyPeopleSearchResponse(response);

  if (
    peopleSearchState.items.length > 0 &&
    !peopleSearchState.items.some((person) => person.sourceRowId === activePersonId)
  ) {
    await loadPerson(peopleSearchState.items[0].sourceRowId);
    queuePeopleSearchAutofill();
    return;
  }

  syncPeopleSelectionState();
  queuePeopleSearchAutofill();
}

async function maybeLoadMorePeople() {
  if (!peopleSearchState.hasMore || peopleSearchState.isLoading) {
    return;
  }

  const visibleRange = computeVisibleRange({
    itemCount: peopleSearchState.total,
    scrollTop: resultsEl.scrollTop,
    viewportHeight: resultsEl.clientHeight,
    rowHeight: peopleVirtualRowHeight,
    rowGap: PEOPLE_SEARCH_ROW_GAP_PX,
    overscan: PEOPLE_SEARCH_OVERSCAN_ROWS
  });
  const needsNextBatch = visibleRange.endIndex >= peopleSearchState.items.length - Math.floor(PEOPLE_SEARCH_BATCH_SIZE / 2);
  const remainingScroll = resultsEl.scrollHeight - resultsEl.scrollTop - resultsEl.clientHeight;
  if (!needsNextBatch && remainingScroll > PEOPLE_SEARCH_SCROLL_THRESHOLD_PX) {
    return;
  }

  const sessionId = peopleSearchSessionId;
  peopleSearchState = {
    ...peopleSearchState,
    isLoading: true
  };
  renderPeople();

  const response = await window.appApi.listPeople({
    query: peopleSearchState.query,
    limit: PEOPLE_SEARCH_BATCH_SIZE,
    offset: peopleSearchState.items.length
  });

  if (sessionId !== peopleSearchSessionId) {
    return;
  }

  applyPeopleSearchResponse(response, {
    append: true
  });
  queuePeopleSearchAutofill();
}

function applyPeopleSearchResponse(response, options = {}) {
  const items = Array.isArray(response?.items) ? response.items : [];
  peopleSearchState = {
    query: peopleSearchState.query,
    items: options.append ? [...peopleSearchState.items, ...items] : items,
    total: Number(response?.total || 0),
    isLoading: false,
    hasLoaded: true,
    hasMore: Boolean(response?.hasMore)
  };
  renderPeople();
}

function renderPeople() {
  resultCountEl.textContent = peopleSearchState.isLoading && !peopleSearchState.hasLoaded
    ? 'Ladowanie...'
    : `${formatNumber(peopleSearchState.total)} rekordow`;

  if (peopleSearchState.isLoading && !peopleSearchState.hasLoaded) {
    resultsEl.innerHTML = '<p class="empty-state">Ladowanie wynikow wyszukiwania...</p>';
    return;
  }

  if (peopleSearchState.items.length === 0) {
    resultsEl.innerHTML = '<p class="empty-state">Brak wynikow dla podanego zapytania.</p>';
    return;
  }

  renderVisiblePeople();
}

function renderVisiblePeople() {
  const visibleRange = computeVisibleRange({
    itemCount: peopleSearchState.total,
    scrollTop: resultsEl.scrollTop,
    viewportHeight: resultsEl.clientHeight,
    rowHeight: peopleVirtualRowHeight,
    rowGap: PEOPLE_SEARCH_ROW_GAP_PX,
    overscan: PEOPLE_SEARCH_OVERSCAN_ROWS
  });
  const rowsMarkup = Array.from(
    { length: Math.max(0, visibleRange.endIndex - visibleRange.startIndex) },
    (_unused, offset) => {
      const itemIndex = visibleRange.startIndex + offset;
      const person = peopleSearchState.items[itemIndex];
      if (!person) {
        return `
          <article class="person-row person-row-placeholder" aria-hidden="true">
            <span class="person-row-title">Ladowanie osoby...</span>
            <span class="person-row-copy">Trwa pobieranie kolejnych wynikow.</span>
            <span class="person-row-copy person-row-meta">Prosze czekac</span>
          </article>
        `;
      }

      const isSelected = person.sourceRowId === activePersonId;
      return `
        <button
          type="button"
          class="person-row${isSelected ? ' is-selected' : ''}"
          data-person-id="${escapeHtml(person.sourceRowId)}"
        >
          <span class="person-row-title">${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</span>
          <span class="person-row-copy">${escapeHtml(person.routeAddress || person.addressText || 'Brak adresu')}</span>
          <span class="person-row-copy person-row-meta">
            Ostatnia wizyta: ${escapeHtml(formatDate(person.lastVisitAt))}
          </span>
        </button>
      `;
    }
  )
    .join('');
  const statusCopy = buildPeopleSearchStatusCopy();
  const statusMarkup = statusCopy
    ? `<p class="lazy-results-status">${escapeHtml(statusCopy)}</p>`
    : '';

  resultsEl.innerHTML = `
    ${buildVirtualSpacerMarkup(visibleRange.topSpacerHeight)}
    ${rowsMarkup}
    ${buildVirtualSpacerMarkup(visibleRange.bottomSpacerHeight)}
    ${statusMarkup}
  `;

  updatePeopleVirtualRowHeight();
  if (visibleRange.endIndex > peopleSearchState.items.length && peopleSearchState.hasMore) {
    queuePeopleSearchAutofill();
  }
}

async function loadPerson(sourceRowId) {
  const details = await window.appApi.getPersonDetails(sourceRowId);
  if (!details) {
    return;
  }

  activePersonId = sourceRowId;
  syncPeopleSelectionState();
  detailTitleEl.textContent = details.person.fullName || 'Szczegoly osoby';
  detailMetaEl.innerHTML = renderKeyValueList([
    { label: 'Adres', value: details.person.routeAddress || details.person.addressText },
    { label: 'Telefon', value: details.person.phone },
    { label: 'E-mail', value: details.person.email },
    { label: 'Ostatnia wizyta', value: formatDate(details.person.lastVisitAt) },
    { label: 'Ostatnia wplata', value: formatDate(details.person.lastPaymentAt) },
    { label: 'Planowana wizyta', value: formatDate(details.person.plannedVisitAt) },
    { label: 'Suma wplat', value: formatMoney(details.person.raw['Suma wpłat']) }
  ]);

  serviceCardsEl.innerHTML = details.serviceCards.length
    ? details.serviceCards
        .map(
          (card) => `
            <article class="list-card">
              <div class="list-card-heading">
                <strong>${escapeHtml(card.cardType || 'Karta serwisowa')}</strong>
                <span>${escapeHtml(formatDate(card.cardDate))}</span>
              </div>
              <p>${escapeHtml(card.technician || 'Brak serwisanta')}</p>
              <p>${escapeHtml(card.eventType || 'Brak typu zdarzenia')}</p>
            </article>
          `
        )
        .join('')
    : '<p class="empty-state">Brak kart serwisowych dla wybranej osoby.</p>';

  notesListEl.innerHTML = details.notes.length
    ? details.notes
        .map(
          (note) => `
            <article class="list-card">
              <div class="list-card-heading">
                <strong>Notatka</strong>
                <span>${escapeHtml(formatDate(note.createdAt))}</span>
              </div>
              <p>${escapeHtml(note.message)}</p>
            </article>
          `
        )
        .join('')
    : '<p class="empty-state">Brak lokalnych notatek.</p>';
}

function schedulePeopleVirtualRender() {
  if (peopleVirtualFrame) {
    return;
  }

  peopleVirtualFrame = requestAnimationFrame(() => {
    peopleVirtualFrame = 0;
    if (!peopleSearchState.hasLoaded || peopleSearchState.items.length === 0) {
      return;
    }

    renderVisiblePeople();
  });
}

function updatePeopleVirtualRowHeight() {
  const rows = Array.from(resultsEl.querySelectorAll('.person-row'));
  if (rows.length === 0) {
    return;
  }

  const nextHeight = Math.round(
    rows.reduce((sum, element) => sum + element.offsetHeight, 0) / rows.length
  );
  if (Number.isFinite(nextHeight) && Math.abs(nextHeight - peopleVirtualRowHeight) >= 2) {
    peopleVirtualRowHeight = nextHeight;
    schedulePeopleVirtualRender();
  }
}

function syncPeopleSelectionState() {
  resultsEl.querySelectorAll('[data-person-id]').forEach((element) => {
    element.classList.toggle('is-selected', element.getAttribute('data-person-id') === activePersonId);
  });
}

function buildPeopleSearchStatusCopy() {
  if (peopleSearchState.isLoading && peopleSearchState.hasLoaded) {
    return 'Ladowanie kolejnych wynikow...';
  }

  if (peopleSearchState.hasMore) {
    return 'Przewin liste, aby doladowac kolejne osoby.';
  }

  return '';
}

function queuePeopleSearchAutofill() {
  if (!peopleSearchState.hasMore || peopleSearchState.isLoading) {
    return;
  }

  requestAnimationFrame(() => {
    void maybeLoadMorePeople();
  });
}

function computeVisibleRange(input) {
  const itemCount = Number(input.itemCount || 0);
  const scrollTop = Math.max(0, Number(input.scrollTop || 0));
  const viewportHeight = Math.max(1, Number(input.viewportHeight || 0));
  const rowHeight = Math.max(1, Number(input.rowHeight || PEOPLE_SEARCH_ESTIMATED_ROW_HEIGHT_PX));
  const rowGap = Math.max(0, Number(input.rowGap || 0));
  const overscan = Math.max(0, Number(input.overscan || 0));
  const stride = rowHeight + rowGap;
  const visibleCount = Math.max(1, Math.ceil(viewportHeight / stride));
  const startIndex = Math.max(0, Math.floor(scrollTop / stride) - overscan);
  const endIndex = Math.min(itemCount, startIndex + visibleCount + overscan * 2);
  const topSpacerHeight = buildVirtualSpacerHeight(startIndex, rowHeight, rowGap);
  const bottomSpacerHeight = buildVirtualSpacerHeight(itemCount - endIndex, rowHeight, rowGap);

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight
  };
}

function buildVirtualSpacerHeight(itemCount, rowHeight, rowGap) {
  if (itemCount <= 0) {
    return 0;
  }

  return itemCount * rowHeight + Math.max(0, itemCount - 1) * rowGap;
}

function buildVirtualSpacerMarkup(height) {
  if (height <= 0) {
    return '';
  }

  return `<div class="virtual-spacer" style="height:${Math.round(height)}px" aria-hidden="true"></div>`;
}
