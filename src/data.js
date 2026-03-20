import { applySummary, escapeHtml, initShell } from './app-shell.js';
import { fetchImportTables, fetchTableRows } from './features/data/data-service.js';
import { renderTableHeader, renderTableRows } from './features/data/table-view.js';
import { getBootstrap, onOperationStatus } from './shared/data/app-api.js';

initShell('data');

const tableSelect = document.getElementById('table-select');
const tableSearchInput = document.getElementById('table-search');
const tableBodyEl = document.getElementById('data-table-body');
const tableHeadEl = document.getElementById('data-table-head');
const pagerInfoEl = document.getElementById('pager-info');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');

let currentPage = 1;
let currentTableName = null;
let tableColumns = [];

onOperationStatus(async (payload) => {
  if (
    payload?.status === 'completed' &&
    (payload.type === 'import' || payload.type === 'trasa-import')
  ) {
    await refreshTables();
  }
});

tableSelect.addEventListener('change', async () => {
  currentPage = 1;
  currentTableName = tableSelect.value;
  await loadPage();
});

tableSearchInput.addEventListener('input', async () => {
  currentPage = 1;
  await loadPage();
});

prevPageBtn.addEventListener('click', async () => {
  currentPage = Math.max(1, currentPage - 1);
  await loadPage();
});

nextPageBtn.addEventListener('click', async () => {
  currentPage += 1;
  await loadPage();
});

bootstrap();

async function bootstrap() {
  const bootstrapData = await getBootstrap();
  applySummary(bootstrapData.summary);
  await refreshTables();
}

async function refreshTables() {
  const tables = await fetchImportTables();
  tableSelect.innerHTML = tables
    .map(
      (table) =>
        `<option value="${escapeHtml(table.name)}">${escapeHtml(table.name)} (${table.rowCount})</option>`
    )
    .join('');

  if (currentTableName && tables.some((table) => table.name === currentTableName)) {
    tableSelect.value = currentTableName;
  } else {
    currentTableName = tables[0]?.name || null;
  }

  if (currentTableName) {
    tableSelect.value = currentTableName;
    await loadPage();
  } else {
    tableBodyEl.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state-cell">Najpierw zaimportuj baze Access.</td>
      </tr>
    `;
  }
}

async function loadPage() {
  if (!currentTableName) {
    return;
  }

  const payload = await fetchTableRows({
    tableName: currentTableName,
    page: currentPage,
    pageSize: 20,
    query: tableSearchInput.value
  });

  const tables = await fetchImportTables();
  const currentTable = tables.find((table) => table.name === currentTableName);
  tableColumns = currentTable?.columns || [];

  renderTableHeader(tableHeadEl, tableColumns);
  renderTableRows(tableBodyEl, payload.rows, tableColumns);

  const totalPages = Math.max(1, Math.ceil(payload.total / payload.pageSize));
  pagerInfoEl.textContent = `Strona ${payload.page} z ${totalPages}`;
  prevPageBtn.disabled = payload.page <= 1;
  nextPageBtn.disabled = payload.page >= totalPages;
}
