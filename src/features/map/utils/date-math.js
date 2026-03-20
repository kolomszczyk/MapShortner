export function getMapTimeColorRangeDateComparableValue(value, options = {}) {
  const normalizeDateInputValue =
    typeof options.normalizeDateInputValue === 'function'
      ? options.normalizeDateInputValue
      : (input) => String(input || '').trim();

  const normalized = normalizeDateInputValue(value);
  if (!normalized) {
    return null;
  }

  const timestamp = Date.parse(`${normalized}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function convertMapTimeColorDateToDaysAgo(dateValue, options = {}) {
  const getComparableValue =
    typeof options.getComparableValue === 'function'
      ? options.getComparableValue
      : (input) => getMapTimeColorRangeDateComparableValue(input, options);
  const comparableValue = getComparableValue(dateValue);
  if (!Number.isFinite(comparableValue)) {
    return '';
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return String(Math.max(0, Math.round((todayUtc - comparableValue) / 86400000)));
}

export function buildMapTimeColorDateFromDaysAgo(daysValue, options = {}) {
  const normalizeNonNegativeIntegerInputValue =
    typeof options.normalizeNonNegativeIntegerInputValue === 'function'
      ? options.normalizeNonNegativeIntegerInputValue
      : (input) => {
        const normalized = String(input ?? '').trim();
        return /^\d+$/.test(normalized) ? normalized : '';
      };
  const normalizedDays = normalizeNonNegativeIntegerInputValue(daysValue);
  if (!normalizedDays) {
    return '';
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetDate = new Date(todayUtc - (Number(normalizedDays) * 86400000));
  return targetDate.toISOString().slice(0, 10);
}

export function buildMapTimeColorRangeDatesFromDaysValues(input = {}, options = {}) {
  const normalizeNonNegativeIntegerInputValue =
    typeof options.normalizeNonNegativeIntegerInputValue === 'function'
      ? options.normalizeNonNegativeIntegerInputValue
      : (value) => String(value ?? '').trim();
  const buildDateFromDaysAgo =
    typeof options.buildDateFromDaysAgo === 'function'
      ? options.buildDateFromDaysAgo
      : (value) => buildMapTimeColorDateFromDaysAgo(value, options);

  const normalizedDaysFrom = normalizeNonNegativeIntegerInputValue(input?.daysFrom);
  const normalizedDaysTo = normalizeNonNegativeIntegerInputValue(input?.daysTo);

  return {
    dateFrom: buildDateFromDaysAgo(normalizedDaysTo),
    dateTo: buildDateFromDaysAgo(normalizedDaysFrom)
  };
}