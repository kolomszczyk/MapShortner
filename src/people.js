import {
  applySummary,
  escapeHtml,
  formatDate,
  formatMoney,
  initShell,
  renderKeyValueList
} from './app-shell.js';

initShell('people');

const searchInput = document.getElementById('people-search');
const resultsEl = document.getElementById('people-results');
const resultCountEl = document.getElementById('people-result-count');
const detailEl = document.getElementById('person-detail');
const notesForm = document.getElementById('person-note-form');
const noteInput = document.getElementById('person-note-input');
const detailTitleEl = document.getElementById('person-detail-title');
const detailMetaEl = document.getElementById('person-detail-meta');
const serviceCardsEl = document.getElementById('person-service-cards');
const notesListEl = document.getElementById('person-notes');

let activePersonId = null;
let searchTimer = null;

window.appApi.onOperationStatus(async (payload) => {
  if (
    payload?.status === 'completed' &&
    (payload.type === 'import' || payload.type === 'trasa-import' || payload.type === 'geocoding')
  ) {
    await loadPeople(searchInput.value);
  }
});

searchInput.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    loadPeople(searchInput.value);
  }, 160);
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
  await loadPeople('');
}

async function loadPeople(query) {
  const people = await window.appApi.listPeople({
    query,
    limit: 200
  });
  resultCountEl.textContent = `${people.length} rekordow`;
  renderPeople(people);

  if (people.length > 0 && !people.some((person) => person.sourceRowId === activePersonId)) {
    await loadPerson(people[0].sourceRowId);
  }
}

function renderPeople(people) {
  resultsEl.replaceChildren();

  if (people.length === 0) {
    resultsEl.innerHTML = '<p class="empty-state">Brak wynikow dla podanego zapytania.</p>';
    return;
  }

  people.forEach((person) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'person-row';
    button.dataset.personId = person.sourceRowId;
    if (person.sourceRowId === activePersonId) {
      button.classList.add('is-selected');
    }
    button.innerHTML = `
      <span class="person-row-title">${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</span>
      <span class="person-row-copy">${escapeHtml(person.routeAddress || person.addressText || 'Brak adresu')}</span>
      <span class="person-row-copy person-row-meta">
        Ostatnia wizyta: ${escapeHtml(formatDate(person.lastVisitAt))}
      </span>
    `;
    button.addEventListener('click', () => {
      loadPerson(person.sourceRowId);
    });
    resultsEl.appendChild(button);
  });
}

async function loadPerson(sourceRowId) {
  const details = await window.appApi.getPersonDetails(sourceRowId);
  if (!details) {
    return;
  }

  activePersonId = sourceRowId;
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
  await loadPeople(searchInput.value);
}
