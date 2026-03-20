export function normalizeDateInputValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const exactDateMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
    if (exactDateMatch) {
      return exactDateMatch[0];
    }

    const isoDateMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoDateMatch) {
      return isoDateMatch[0];
    }
  }

  if (!value) {
    return '';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toISOString().slice(0, 10);
}

export function normalizeMonthInputValue(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : '';
}

export function normalizeMonthNumberInputValue(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return /^(0[1-9]|1[0-2])$/.test(trimmed) ? trimmed : '';
}

export function normalizeYearInputValue(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return /^\d{4}$/.test(trimmed) ? trimmed : '';
}

export function getMonthEndDate(monthValue) {
  const normalized = normalizeMonthInputValue(monthValue);
  if (!normalized) {
    return '';
  }

  const [yearPart, monthPart] = normalized.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 1 || monthIndex > 12) {
    return '';
  }

  const lastDay = new Date(Date.UTC(year, monthIndex, 0));
  return lastDay.toISOString().slice(0, 10);
}

export function extractMonthValue(dateValue) {
  const normalizedDate = normalizeDateInputValue(dateValue);
  return normalizedDate ? normalizedDate.slice(0, 7) : '';
}

export function extractYearValue(dateValue) {
  const monthValue = extractMonthValue(dateValue);
  return monthValue ? monthValue.slice(0, 4) : '';
}

export function extractMonthNumberValue(dateValue) {
  const monthValue = extractMonthValue(dateValue);
  return monthValue ? monthValue.slice(5, 7) : '';
}