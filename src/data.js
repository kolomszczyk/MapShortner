import { applySummary, escapeHtml, initShell } from './app-shell.js';

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
  const bootstrapData = await window.appApi.getBootstrap();
  applySummary(bootstrapData.summary);

  const tables = await window.appApi.getImportTables();
  tableSelect.innerHTML = tables
    .map(
      (table) =>
        `<option value="${escapeHtml(table.name)}">${escapeHtml(table.name)} (${table.rowCount})</option>`
    )
    .join('');

  currentTableName = tables[0]?.name || null;
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

  const payload = await window.appApi.getTableRows({
    tableName: currentTableName,
    page: currentPage,
    pageSize: 20,
    query: tableSearchInput.value
  });

  const tables = await window.appApi.getImportTables();
  const currentTable = tables.find((table) => table.name === currentTableName);
  tableColumns = currentTable?.columns || [];

  renderHeader(tableColumns);
  renderRows(payload.rows, tableColumns);

  const totalPages = Math.max(1, Math.ceil(payload.total / payload.pageSize));
  pagerInfoEl.textContent = `Strona ${payload.page} z ${totalPages}`;
  prevPageBtn.disabled = payload.page <= 1;
  nextPageBtn.disabled = payload.page >= totalPages;
}

function renderHeader(columns) {
  tableHeadEl.innerHTML = columns
    .slice(0, 8)
    .map((column) => `<th>${escapeHtml(column.name)}</th>`)
    .join('');
}

function renderRows(rows, columns) {
  const visibleColumns = columns.slice(0, 8).map((column) => column.name);
  if (rows.length === 0) {
    tableBodyEl.innerHTML = `
      <tr>
        <td colspan="${Math.max(visibleColumns.length, 1)}" class="empty-state-cell">
          Brak rekordow dla wybranej tabeli.
        </td>
      </tr>
    `;
    return;
  }

  tableBodyEl.innerHTML = rows
    .map((row) => {
      const cells = visibleColumns
        .map((columnName) => `<td>${escapeHtml(displayCellValue(row.data[columnName]))}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
}

function displayCellValue(value) {
  if (value == null || value === '') {
    return 'Brak';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
