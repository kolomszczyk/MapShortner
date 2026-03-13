import {
  applySummary,
  escapeHtml,
  formatDate,
  formatNumber,
  initShell,
  pickRecordValue,
  renderRecordFields,
  renderKeyValueList
} from './app-shell.js';

initShell('people');

const PEOPLE_SEARCH_BATCH_SIZE = 50;
const PEOPLE_SEARCH_SCROLL_THRESHOLD_PX = 120;
const PEOPLE_SEARCH_ROW_GAP_PX = 10;
const PEOPLE_SEARCH_ESTIMATED_ROW_HEIGHT_PX = 96;
const LAST_SELECTED_PERSON_STORAGE_KEY = 'map:lastSelectedPersonId';
const LAST_SELECTED_PERSON_DETAILS_STORAGE_KEY = 'people:lastSelectedPersonDetails';
const RAW_FIELDS_EXPANDED_STORAGE_KEY = 'person:rawFieldsExpanded';
const LEGACY_PEOPLE_RAW_FIELDS_EXPANDED_STORAGE_KEY = 'people:rawFieldsExpanded';
const LEGACY_MAP_RAW_FIELDS_EXPANDED_STORAGE_KEY = 'map:rawFieldsExpanded';

const searchInput = document.getElementById('people-search');
const resultsEl = document.getElementById('people-results');
const resultCountEl = document.getElementById('people-result-count');
const notesForm = document.getElementById('person-note-form');
const noteInput = document.getElementById('person-note-input');
const detailTitleEl = document.getElementById('person-detail-title');
const detailMetaEl = document.getElementById('person-detail-meta');
const detailHighlightEl = document.getElementById('person-detail-highlight');
const rawFieldsEl = document.getElementById('person-raw-fields');
const rawFieldsToggleButtonEl = document.getElementById('person-raw-fields-toggle');
const serviceCardsEl = document.getElementById('person-service-cards');
const notesListEl = document.getElementById('person-notes');
const notesSectionEl = notesForm?.closest('.subpanel') || null;
const serviceCardsSectionEl = serviceCardsEl?.closest('.subpanel') || null;

let activePersonId = null;
let searchTimer = null;
let peopleSearchRequestToken = 0;
let personDetailsRequestToken = 0;
let peopleSearchRowHeight = PEOPLE_SEARCH_ESTIMATED_ROW_HEIGHT_PX;
let areRawFieldsExpanded = readStoredRawFieldsExpanded();
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
    await loadPeople(searchInput.value, { reset: true });
  }
});

searchInput.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    void loadPeople(searchInput.value, { reset: true });
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
  void maybeLoadMorePeople();
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

rawFieldsToggleButtonEl?.addEventListener('click', () => {
  areRawFieldsExpanded = !areRawFieldsExpanded;
  persistRawFieldsExpanded();
  syncRawFieldsVisibility();
});

bootstrap();

async function bootstrap() {
  const bootstrapData = await window.appApi.getBootstrap();
  applySummary(bootstrapData.summary);
  syncRawFieldsVisibility();
  const restoredSelectionPromise = restoreInitialPersonSelection();
  await loadPeople('', { reset: true, allowSelectionFallback: !activePersonId });
  const restoredSelection = await restoredSelectionPromise;
  if (!restoredSelection && !activePersonId && peopleSearchState.items.length > 0) {
    void loadPerson(peopleSearchState.items[0].sourceRowId);
  }
}

async function loadPeople(query, options = {}) {
  const requestToken = options.requestToken ?? ++peopleSearchRequestToken;
  const normalizedQuery = String(query || '');
  const reset = options.reset !== false;
  const allowSelectionFallback = options.allowSelectionFallback !== false;

  peopleSearchState = reset
    ? {
        query: normalizedQuery,
        items: [],
        total: 0,
        isLoading: true,
        hasLoaded: false,
        hasMore: false
      }
    : {
        ...peopleSearchState,
        query: normalizedQuery,
        isLoading: true
      };

  if (reset) {
    renderPeople();
  } else {
    resultCountEl.textContent = `${formatNumber(peopleSearchState.total)} rekordow`;
    showPeopleLoadingState();
  }

  const response = await window.appApi.listPeople({
    query: normalizedQuery,
    limit: PEOPLE_SEARCH_BATCH_SIZE,
    offset: reset ? 0 : peopleSearchState.items.length
  });

  if (requestToken !== peopleSearchRequestToken) {
    return;
  }

  const items = Array.isArray(response?.items) ? response.items : [];
  peopleSearchState = {
    query: normalizedQuery,
    items: reset ? items : [...peopleSearchState.items, ...items],
    total: Number(response?.total || 0),
    isLoading: false,
    hasLoaded: true,
    hasMore: Boolean(response?.hasMore)
  };
  if (reset) {
    renderPeople();
  } else {
    appendPeople(items);
  }

  if (
    reset &&
    allowSelectionFallback &&
    peopleSearchState.items.length > 0 &&
    !peopleSearchState.items.some((person) => person.sourceRowId === activePersonId)
  ) {
    void loadPerson(peopleSearchState.items[0].sourceRowId);
  }
}

async function maybeLoadMorePeople() {
  if (!peopleSearchState.hasMore || peopleSearchState.isLoading) {
    return;
  }

  const loadedContentHeight = peopleSearchState.items.length * getPeopleSearchRowStride();
  const viewportBottom = resultsEl.scrollTop + resultsEl.clientHeight;
  if (viewportBottom + PEOPLE_SEARCH_SCROLL_THRESHOLD_PX < loadedContentHeight) {
    return;
  }

  await loadPeople(peopleSearchState.query, {
    reset: false,
    requestToken: peopleSearchRequestToken
  });
}

function renderPeople() {
  if (peopleSearchState.isLoading && !peopleSearchState.hasLoaded) {
    resultCountEl.textContent = 'Ladowanie...';
    resultsEl.innerHTML = '<p class="empty-state">Ladowanie wynikow wyszukiwania...</p>';
    return;
  }

  resultCountEl.textContent = `${formatNumber(peopleSearchState.total)} rekordow`;

  if (peopleSearchState.items.length === 0) {
    resultsEl.innerHTML = '<p class="empty-state">Brak wynikow dla podanego zapytania.</p>';
    return;
  }

  resultsEl.replaceChildren();
  resultsEl.insertAdjacentHTML('beforeend', renderPeopleRows(peopleSearchState.items));
  syncPeopleResultsTail();
  updatePeopleRowHeight();
  syncPeopleSelectionState();
}

function appendPeople(items) {
  removePeopleResultsTail();
  if (items.length > 0) {
    resultsEl.insertAdjacentHTML('beforeend', renderPeopleRows(items));
  }
  syncPeopleResultsTail();
  updatePeopleRowHeight();
  syncPeopleSelectionState();
}

function renderPeopleRows(people) {
  return people
    .map((person) => {
      const isSelected = person.sourceRowId === activePersonId;
      return `
        <button
          type="button"
          class="person-row${isSelected ? ' is-selected' : ''}"
          data-person-id="${escapeHtml(person.sourceRowId)}"
        >
          <span class="person-row-title">${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</span>
          <span class="person-row-copy person-row-meta">
            Ostatnia wizyta: ${escapeHtml(formatDate(person.lastVisitAt))}
          </span>
        </button>
      `;
    })
    .join('');
}

function removePeopleLoadingState() {
  resultsEl.querySelector('[data-people-loading-more]')?.remove();
}

function removePeopleResultsTail() {
  removePeopleLoadingState();
  resultsEl.querySelector('[data-people-results-spacer]')?.remove();
}

function showPeopleLoadingState() {
  if (resultsEl.querySelector('[data-people-loading-more]')) {
    return;
  }

  const loading = document.createElement('p');
  loading.className = 'empty-state';
  loading.dataset.peopleLoadingMore = 'true';
  loading.textContent = 'Ladowanie kolejnych wynikow...';
  resultsEl.appendChild(loading);
}

function syncPeopleResultsTail() {
  removePeopleResultsTail();
  if (peopleSearchState.isLoading && peopleSearchState.hasLoaded) {
    showPeopleLoadingState();
  }
  appendPeopleResultsSpacer();
}

function appendPeopleResultsSpacer() {
  const remainingCount = Math.max(0, peopleSearchState.total - peopleSearchState.items.length);
  if (remainingCount <= 0) {
    return;
  }

  const spacer = document.createElement('div');
  spacer.className = 'results-spacer';
  spacer.dataset.peopleResultsSpacer = 'true';
  spacer.style.height = `${Math.round(remainingCount * getPeopleSearchRowStride())}px`;
  spacer.setAttribute('aria-hidden', 'true');
  resultsEl.appendChild(spacer);
}

function updatePeopleRowHeight() {
  const rows = Array.from(resultsEl.querySelectorAll('.person-row'));
  if (rows.length === 0) {
    return;
  }

  const nextHeight = Math.round(rows.reduce((sum, row) => sum + row.offsetHeight, 0) / rows.length);
  if (Number.isFinite(nextHeight) && nextHeight > 0 && nextHeight !== peopleSearchRowHeight) {
    peopleSearchRowHeight = nextHeight;
    const spacer = resultsEl.querySelector('[data-people-results-spacer]');
    if (spacer) {
      const remainingCount = Math.max(0, peopleSearchState.total - peopleSearchState.items.length);
      spacer.style.height = `${Math.round(remainingCount * getPeopleSearchRowStride())}px`;
    }
  }
}

function getPeopleSearchRowStride() {
  return peopleSearchRowHeight + PEOPLE_SEARCH_ROW_GAP_PX;
}

async function loadPerson(sourceRowId) {
  const normalizedSourceRowId = String(sourceRowId || '').trim();
  if (!normalizedSourceRowId) {
    return false;
  }

  const requestToken = ++personDetailsRequestToken;
  const details = await window.appApi.getPersonDetails(normalizedSourceRowId);
  if (requestToken !== personDetailsRequestToken) {
    return false;
  }

  if (!details) {
    if (activePersonId === normalizedSourceRowId) {
      activePersonId = null;
      syncPeopleSelectionState();
      renderEmptyPersonDetails();
    }
    clearStoredLastSelectedPerson();
    return false;
  }

  activePersonId = normalizedSourceRowId;
  persistLastSelectedPerson(details);
  syncPeopleSelectionState();
  renderPersonDetails(details);
  return true;
}

function renderPersonDetails(details) {
  if (!details?.person) {
    return;
  }

  detailTitleEl.textContent = details.person.fullName || 'Szczegoly osoby';
  detailMetaEl.innerHTML = renderKeyValueList([
    { label: 'ID', value: details.person.sourceRowId || details.person.id || '-' },
    { label: 'Adres', value: details.person.routeAddress || details.person.addressText },
    { label: 'Telefon', value: details.person.phone },
    { label: 'E-mail', value: details.person.email },
    { label: 'Ostatnia wizyta', value: formatDate(details.person.lastVisitAt) },
    { label: 'Ostatnia wplata', value: formatDate(details.person.lastPaymentAt) },
    ...buildPersonPrimaryDetailItems(details.person)
  ]);
  renderPersonHighlights(details.person);
  rawFieldsEl.innerHTML = renderRecordFields(details.person.raw);
  syncRawFieldsVisibility();

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

async function restoreInitialPersonSelection() {
  const lastSelectedPersonId = readLastSelectedPersonId();
  if (!lastSelectedPersonId) {
    return false;
  }

  activePersonId = lastSelectedPersonId;
  syncPeopleSelectionState();

  const cachedDetails = readStoredLastSelectedPersonDetails(lastSelectedPersonId);
  if (cachedDetails) {
    renderPersonDetails(cachedDetails);
  }

  return loadPerson(lastSelectedPersonId);
}

function renderEmptyPersonDetails() {
  detailTitleEl.textContent = 'Wybierz osobe z listy';
  detailMetaEl.innerHTML = '';
  detailHighlightEl.innerHTML = '';
  detailHighlightEl.hidden = true;
  rawFieldsEl.innerHTML = '<p class="empty-state">Pelne dane pojawia sie po wybraniu osoby.</p>';
  syncRawFieldsVisibility();
  serviceCardsEl.innerHTML = '<p class="empty-state">Brak kart serwisowych dla wybranej osoby.</p>';
  notesListEl.innerHTML = '<p class="empty-state">Brak lokalnych notatek.</p>';
}

function syncRawFieldsVisibility() {
  if (!detailMetaEl || !rawFieldsToggleButtonEl) {
    return;
  }

  const isExpanded = areRawFieldsExpanded;

  detailMetaEl.hidden = !isExpanded;
  detailHighlightEl.hidden = !isExpanded || !detailHighlightEl.innerHTML.trim();
  rawFieldsEl.hidden = !isExpanded;
  notesSectionEl.hidden = !isExpanded;
  serviceCardsSectionEl.hidden = !isExpanded;
  rawFieldsToggleButtonEl.textContent = areRawFieldsExpanded ? 'Ukryj' : 'Pokaz';
  rawFieldsToggleButtonEl.setAttribute('aria-expanded', String(areRawFieldsExpanded));
}

function buildPersonPrimaryDetailItems(person) {
  const raw = person.raw || {};
  const producer = person.deviceVendor || pickRecordValue(raw, ['Producent']);
  const installerCompany = pickRecordValue(raw, [
    'Firma montująca',
    'Firma montujaca',
    'Firma montazowa'
  ]);
  const geyserNumber = pickRecordValue(raw, ['Nr gejzer', 'Nr gejzera', 'Numer gejzer']);
  const items = [
    { label: 'Producent', value: producer || 'Brak' }
  ];

  if (
    installerCompany &&
    normalizeComparableText(installerCompany) !== normalizeComparableText(producer)
  ) {
    items.push({ label: 'Firma montujaca', value: installerCompany });
  }

  items.push(
    { label: 'Nr gejzer', value: geyserNumber || 'Brak' },
    { label: 'Data montazu', value: formatPersonInstallDate(person, raw) }
  );

  return items;
}

function renderPersonHighlights(person) {
  if (!detailHighlightEl) {
    return;
  }

  const cards = [];

  const secondaryItems = buildPersonSecondaryDetailItems(person);
  if (secondaryItems.length > 0) {
    cards.push(`<div class="kv-grid detail-secondary-grid">${renderKeyValueList(secondaryItems)}</div>`);
  }

  if (person.notesSummary) {
    cards.push(`
      <article class="list-card detail-note-card">
        <div class="list-card-heading">
          <strong>Uwagi</strong>
        </div>
        <p class="detail-note-text">${escapeHtml(person.notesSummary)}</p>
      </article>
    `);
  }

  if (cards.length === 0) {
    detailHighlightEl.innerHTML = '';
    detailHighlightEl.hidden = true;
    return;
  }

  detailHighlightEl.innerHTML = cards.join('');
  detailHighlightEl.hidden = !areRawFieldsExpanded;
}

function buildPersonSecondaryDetailItems(person) {
  const raw = person.raw || {};
  const inspection = pickRecordValue(raw, ['Prze tn', 'Przegląd', 'Przeglad']);
  const softwareVersion = pickRecordValue(raw, ['Soft wersja', 'Wersja softwaru', 'Wersja software']);

  return [
    { label: 'Przeglad', value: inspection || 'Brak' },
    { label: 'Wersja softwaru', value: softwareVersion || 'Brak' }
  ];
}

function formatPersonInstallDate(person, raw) {
  if (person.installedAt) {
    return formatDate(person.installedAt);
  }

  return pickRecordValue(raw, ['Data montażu', 'Data montazu', 'Data montaźu']) || 'Brak';
}

function normalizeComparableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function readStoredRawFieldsExpanded() {
  try {
    const rawValue = window.localStorage.getItem(RAW_FIELDS_EXPANDED_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_PEOPLE_RAW_FIELDS_EXPANDED_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_MAP_RAW_FIELDS_EXPANDED_STORAGE_KEY);
    return rawValue == null ? true : rawValue === 'true';
  } catch (_error) {
    return true;
  }
}

function persistRawFieldsExpanded() {
  try {
    window.localStorage.setItem(RAW_FIELDS_EXPANDED_STORAGE_KEY, String(areRawFieldsExpanded));
  } catch (_error) {
    // Ignore storage write errors.
  }
}

function readLastSelectedPersonId() {
  try {
    return window.localStorage.getItem(LAST_SELECTED_PERSON_STORAGE_KEY);
  } catch (_error) {
    return null;
  }
}

function readStoredLastSelectedPersonDetails(sourceRowId) {
  try {
    const raw = window.localStorage.getItem(LAST_SELECTED_PERSON_DETAILS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed?.person?.sourceRowId === sourceRowId ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function persistLastSelectedPerson(details) {
  const sourceRowId = details?.person?.sourceRowId;
  if (!sourceRowId) {
    return;
  }

  try {
    window.localStorage.setItem(LAST_SELECTED_PERSON_STORAGE_KEY, sourceRowId);
    window.localStorage.setItem(
      LAST_SELECTED_PERSON_DETAILS_STORAGE_KEY,
      JSON.stringify(details)
    );
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }
}

function clearStoredLastSelectedPerson() {
  try {
    window.localStorage.removeItem(LAST_SELECTED_PERSON_STORAGE_KEY);
    window.localStorage.removeItem(LAST_SELECTED_PERSON_DETAILS_STORAGE_KEY);
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }
}

function syncPeopleSelectionState() {
  resultsEl.querySelectorAll('[data-person-id]').forEach((element) => {
    element.classList.toggle('is-selected', element.getAttribute('data-person-id') === activePersonId);
  });
}
