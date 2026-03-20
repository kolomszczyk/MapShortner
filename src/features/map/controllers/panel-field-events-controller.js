export function bindSelectionPanelFieldEvents(options = {}) {
  const selectionExtraEl = options.selectionExtraEl;
  if (!selectionExtraEl) {
    return;
  }

  const getInfoPanelMode =
    typeof options.getInfoPanelMode === 'function' ? options.getInfoPanelMode : () => '';

  selectionExtraEl.addEventListener('scroll', () => {
    options.onScroll?.();
  }, { passive: true });

  selectionExtraEl.addEventListener('dblclick', (event) => {
    if (getInfoPanelMode() !== 'colors') {
      return;
    }

    const titleGroup = event.target.closest('[data-map-time-color-title-group]');
    if (!titleGroup) {
      return;
    }

    const rangeId = titleGroup.getAttribute('data-map-time-color-title-group');
    if (!rangeId) {
      return;
    }

    options.onDoubleClickTitleGroup?.(rangeId);
  });

  selectionExtraEl.addEventListener('input', (event) => {
    const infoPanelMode = getInfoPanelMode();

    const searchField = event.target.closest('[data-map-person-search-input]');
    if (searchField && infoPanelMode === 'search') {
      options.onSearchInput?.(searchField.value);
      return;
    }

    const customTimeColorInput = event.target.closest('.time-color-menu-custom-input');
    if (customTimeColorInput && infoPanelMode === 'colors') {
      options.onCustomTimeColorInput?.(
        customTimeColorInput.closest('.time-color-menu'),
        customTimeColorInput.value
      );
      return;
    }

    const previewField = event.target.closest('[data-map-time-color-preview-field]');
    if (previewField && infoPanelMode === 'colors') {
      const previewFieldValue = previewField instanceof HTMLInputElement && previewField.type === 'checkbox'
        ? String(previewField.checked)
        : previewField.value;
      options.onTimeColorPreviewFieldInput?.(
        previewField.getAttribute('data-map-time-color-preview-range-id'),
        previewField.getAttribute('data-map-time-color-preview-field'),
        previewFieldValue
      );
      return;
    }

    const timeColorField = event.target.closest('[data-map-time-color-form] input, [data-map-time-color-form] textarea');
    if (!timeColorField || infoPanelMode !== 'colors') {
      return;
    }

    const timeColorForm = timeColorField.closest('[data-map-time-color-form]');
    if (!timeColorForm) {
      return;
    }

    const timeColorRow = timeColorField.closest('[data-map-time-color-row-id]');
    const timeColorFieldName = timeColorField.getAttribute('data-map-time-color-field');
    options.onTimeColorFieldInput?.(timeColorForm, timeColorRow, timeColorFieldName);
  });

  selectionExtraEl.addEventListener('change', (event) => {
    const infoPanelMode = getInfoPanelMode();

    const customTimeColorInput = event.target.closest('.time-color-menu-custom-input');
    if (customTimeColorInput && infoPanelMode === 'colors') {
      options.onCustomTimeColorInput?.(
        customTimeColorInput.closest('.time-color-menu'),
        customTimeColorInput.value
      );
      return;
    }

    const previewField = event.target.closest('[data-map-time-color-preview-field]');
    if (previewField && infoPanelMode === 'colors') {
      const previewFieldValue = previewField instanceof HTMLInputElement && previewField.type === 'checkbox'
        ? String(previewField.checked)
        : previewField.value;
      options.onTimeColorPreviewFieldChange?.(
        previewField,
        previewField.getAttribute('data-map-time-color-preview-range-id'),
        previewField.getAttribute('data-map-time-color-preview-field'),
        previewFieldValue
      );
      return;
    }

    const timeColorDateMatchModeField = event.target.closest('[data-map-time-color-date-match-mode]');
    if (timeColorDateMatchModeField && infoPanelMode === 'colors') {
      options.onTimeColorDateMatchModeChange?.(timeColorDateMatchModeField.value);
      return;
    }

    const timeColorField = event.target.closest('[data-map-time-color-form] input, [data-map-time-color-form] select');
    if (timeColorField && infoPanelMode === 'colors') {
      const timeColorForm = timeColorField.closest('[data-map-time-color-form]');
      if (!timeColorForm) {
        return;
      }

      const timeColorRow = timeColorField.closest('[data-map-time-color-row-id]');
      const timeColorFieldName = timeColorField.getAttribute('data-map-time-color-field');
      options.onTimeColorFieldChange?.(timeColorField, timeColorForm, timeColorRow, timeColorFieldName);
      return;
    }

    const filterField = event.target.closest('[data-map-date-filter-form] select');
    if (!filterField || infoPanelMode !== 'filter') {
      return;
    }

    const filterForm = filterField.closest('[data-map-date-filter-form]');
    if (!filterForm) {
      return;
    }

    options.onFilterFormChange?.(filterForm);
  });
}