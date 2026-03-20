export function buildMapTimeColorRangeDateDraft(range = {}, options = {}) {
  const buildMapDateFilterDraft =
    typeof options.buildMapDateFilterDraft === 'function'
      ? options.buildMapDateFilterDraft
      : (input) => input;

  return buildMapDateFilterDraft({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    fromMonth: range.mode === 'dates' && typeof range.dateFromMonthDraft === 'string'
      ? range.dateFromMonthDraft
      : undefined,
    toMonth: range.mode === 'dates' && typeof range.dateToMonthDraft === 'string'
      ? range.dateToMonthDraft
      : undefined
  });
}

export function resolveMapTimeColorMiddleDateDraft(input = {}, options = {}) {
  const normalizeMapTimeColorMiddleDateDraft =
    typeof options.normalizeMapTimeColorMiddleDateDraft === 'function'
      ? options.normalizeMapTimeColorMiddleDateDraft
      : (value) => value;
  const draft = normalizeMapTimeColorMiddleDateDraft(input);
  if (options?.mode !== 'dates') {
    return draft;
  }

  return {
    fromYear: draft.fromYear,
    fromMonth: draft.fromYear ? draft.fromMonth : '',
    toYear: draft.toYear,
    toMonth: draft.toYear ? draft.toMonth : ''
  };
}

export function buildMapTimeColorMiddleDateDraft(range = {}, options = {}) {
  const buildRangeDateDraft =
    typeof options.buildMapTimeColorRangeDateDraft === 'function'
      ? options.buildMapTimeColorRangeDateDraft
      : (inputRange) => inputRange;
  const resolveMiddleDateDraft =
    typeof options.resolveMapTimeColorMiddleDateDraft === 'function'
      ? options.resolveMapTimeColorMiddleDateDraft
      : (inputDraft) => inputDraft;

  return resolveMiddleDateDraft(
    buildRangeDateDraft(range),
    { mode: range?.mode }
  );
}

export function resolveMapTimeColorMiddleBoundarySelection(boundary = 'start', input = {}, options = {}) {
  const normalizeYearInputValue =
    typeof options.normalizeYearInputValue === 'function'
      ? options.normalizeYearInputValue
      : (value) => String(value || '').trim();
  const normalizeMonthNumberInputValue =
    typeof options.normalizeMonthNumberInputValue === 'function'
      ? options.normalizeMonthNumberInputValue
      : (value) => String(value || '').trim();

  const rawYear = normalizeYearInputValue(input?.year);
  const rawMonth = normalizeMonthNumberInputValue(input?.month);

  return {
    year: rawYear,
    month: rawYear ? rawMonth : ''
  };
}

export function buildMapTimeColorMiddleBoundaryDate(boundary = 'start', input = {}, options = {}) {
  const resolveBoundarySelection =
    typeof options.resolveMapTimeColorMiddleBoundarySelection === 'function'
      ? options.resolveMapTimeColorMiddleBoundarySelection
      : (_boundary, selectionInput) => selectionInput;
  const getMonthEndDate =
    typeof options.getMonthEndDate === 'function'
      ? options.getMonthEndDate
      : (value) => value;

  const normalizedBoundary = boundary === 'end' ? 'end' : 'start';
  const resolved = resolveBoundarySelection(normalizedBoundary, input);
  if (!resolved.year) {
    return '';
  }

  if (normalizedBoundary === 'end') {
    return resolved.month
      ? getMonthEndDate(`${resolved.year}-${resolved.month}`)
      : `${resolved.year}-12-31`;
  }

  return `${resolved.year}-${resolved.month || '01'}-01`;
}