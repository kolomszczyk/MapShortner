import { getImportTables, getTableRows } from '../../shared/data/app-api.js';

export function fetchImportTables() {
  return getImportTables();
}

export function fetchTableRows(input = {}) {
  return getTableRows(input);
}