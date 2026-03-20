import { escapeHtml } from '../../app-shell.js';

export function renderTableHeader(tableHeadElement, columns = []) {
  tableHeadElement.innerHTML = columns
    .slice(0, 8)
    .map((column) => `<th>${escapeHtml(column.name)}</th>`)
    .join('');
}

export function renderTableRows(tableBodyElement, rows = [], columns = []) {
  const visibleColumns = columns.slice(0, 8).map((column) => column.name);
  if (rows.length === 0) {
    tableBodyElement.innerHTML = `
      <tr>
        <td colspan="${Math.max(visibleColumns.length, 1)}" class="empty-state-cell">
          Brak rekordow dla wybranej tabeli.
        </td>
      </tr>
    `;
    return;
  }

  tableBodyElement.innerHTML = rows
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