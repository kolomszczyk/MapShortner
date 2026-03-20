export function routeSelectionPanelClick(event, options = {}) {
  const infoPanelMode = options.infoPanelMode;

  const rawFieldsToggleButton = event.target.closest('[data-map-toggle-raw-fields]');
  if (rawFieldsToggleButton && infoPanelMode === 'selection' && options.selectionPanelKind === 'person') {
    options.onToggleRawFields?.();
    return true;
  }

  const personRowBookmarkToggle = event.target.closest('[data-map-person-bookmark-toggle]');
  if (personRowBookmarkToggle) {
    event.preventDefault();
    event.stopPropagation();
    options.onTogglePersonBookmarkRow?.(personRowBookmarkToggle);
    return true;
  }

  const copyPersonIdControl = event.target.closest('[data-map-copy-person-id]');
  if (copyPersonIdControl) {
    event.preventDefault();
    event.stopPropagation();
    options.onCopyPersonId?.(copyPersonIdControl.getAttribute('data-map-copy-person-id'));
    return true;
  }

  const overlapPersonButton = event.target.closest('[data-map-overlap-source-row-id]');
  if (overlapPersonButton && infoPanelMode === 'selection') {
    event.preventDefault();
    event.stopPropagation();
    options.onSelectOverlapPerson?.(overlapPersonButton.getAttribute('data-map-overlap-source-row-id'));
    return true;
  }

  const sameLocationPersonButton = event.target.closest('[data-map-same-location-source-row-id]');
  if (sameLocationPersonButton && infoPanelMode === 'selection') {
    event.preventDefault();
    event.stopPropagation();
    options.onSelectSameLocationPerson?.(sameLocationPersonButton.getAttribute('data-map-same-location-source-row-id'));
    return true;
  }

  const filterResultButton = event.target.closest('[data-map-filter-source-row-id]');
  if (filterResultButton && infoPanelMode === 'filter') {
    options.onSelectFilterResult?.(filterResultButton.getAttribute('data-map-filter-source-row-id'));
    return true;
  }

  const searchResultButton = event.target.closest('[data-map-search-source-row-id]');
  if (searchResultButton && infoPanelMode === 'search') {
    options.onSelectSearchResult?.(searchResultButton.getAttribute('data-map-search-source-row-id'));
    return true;
  }

  const listResultButton = event.target.closest('[data-map-list-source-row-id]');
  if (listResultButton && infoPanelMode === 'list') {
    options.onSelectListResult?.(listResultButton.getAttribute('data-map-list-source-row-id'));
    return true;
  }

  const bookmarkedResultButton = event.target.closest('[data-map-bookmarked-source-row-id]');
  if (bookmarkedResultButton && infoPanelMode === 'bookmarked') {
    options.onSelectBookmarkedResult?.(bookmarkedResultButton.getAttribute('data-map-bookmarked-source-row-id'));
    return true;
  }

  const clearSearchButton = event.target.closest('[data-map-person-search-clear]');
  if (clearSearchButton && infoPanelMode === 'search') {
    options.onClearSearch?.();
    return true;
  }

  const resetFilterFieldButton = event.target.closest('[data-map-date-filter-reset-field]');
  if (resetFilterFieldButton && infoPanelMode === 'filter') {
    const fieldName = String(resetFilterFieldButton.getAttribute('data-map-date-filter-reset-field') || '').trim();
    options.onResetFilterField?.(fieldName);
    return true;
  }

  const resetFilterButton = event.target.closest('[data-map-date-filter-reset]');
  if (resetFilterButton && infoPanelMode === 'filter') {
    options.onResetFilter?.();
    return true;
  }

  const addTimeColorRangeButton = event.target.closest('[data-map-time-color-add]');
  if (addTimeColorRangeButton && infoPanelMode === 'colors') {
    options.onAddTimeColorRange?.();
    return true;
  }

  const removeTimeColorRangeButton = event.target.closest('[data-map-time-color-remove]');
  if (removeTimeColorRangeButton && infoPanelMode === 'colors') {
    options.onRemoveTimeColorRange?.(removeTimeColorRangeButton.getAttribute('data-map-time-color-remove'));
    return true;
  }

  const previewDisableTimeColorRangeButton = event.target.closest('[data-map-time-color-preview-disable]');
  if (previewDisableTimeColorRangeButton && infoPanelMode === 'colors') {
    options.onDisableTimeColorRangePreview?.(previewDisableTimeColorRangeButton.getAttribute('data-map-time-color-preview-disable'));
    return true;
  }

  const previewRemoveTimeColorRangeButton = event.target.closest('[data-map-time-color-preview-remove]');
  if (previewRemoveTimeColorRangeButton && infoPanelMode === 'colors') {
    options.onRemoveTimeColorRange?.(previewRemoveTimeColorRangeButton.getAttribute('data-map-time-color-preview-remove'));
    return true;
  }

  const confirmTimeColorDialogButton = event.target.closest('[data-map-time-color-confirm]');
  if (confirmTimeColorDialogButton && infoPanelMode === 'colors') {
    options.onConfirmTimeColorDialog?.();
    return true;
  }

  if (event.target instanceof Element && event.target.matches('.time-color-confirm-overlay') && infoPanelMode === 'colors') {
    options.onCancelTimeColorDialog?.();
    return true;
  }

  const cancelTimeColorDialogButton = event.target.closest('[data-map-time-color-confirm-cancel]');
  if (cancelTimeColorDialogButton && infoPanelMode === 'colors') {
    options.onCancelTimeColorDialog?.();
    return true;
  }

  const resetTimeColorRangesButton = event.target.closest('[data-map-time-color-reset]');
  if (resetTimeColorRangesButton && infoPanelMode === 'colors') {
    options.onPromptResetTimeColorRanges?.();
    return true;
  }

  const timeColorPresetButton = event.target.closest('[data-map-time-color-menu-preset]');
  if (timeColorPresetButton && infoPanelMode === 'colors') {
    event.preventDefault();
    options.onApplyTimeColorPreset?.(
      timeColorPresetButton.closest('.time-color-menu'),
      timeColorPresetButton.getAttribute('data-map-time-color-menu-preset')
    );
    return true;
  }

  const confirmCustomTimeColorButton = event.target.closest('[data-map-time-color-menu-custom-confirm]');
  if (confirmCustomTimeColorButton && infoPanelMode === 'colors') {
    const menuElement = confirmCustomTimeColorButton.closest('.time-color-menu');
    const pendingColor = menuElement?.dataset?.pendingColor || '';
    options.onConfirmCustomTimeColor?.(menuElement, pendingColor);
    return true;
  }

  const focusTimeColorLabelButton = event.target.closest('[data-map-time-color-focus-label]');
  if (focusTimeColorLabelButton && infoPanelMode === 'colors') {
    options.onFocusTimeColorLabel?.(focusTimeColorLabelButton.getAttribute('data-map-time-color-focus-label'));
    return true;
  }

  const legendValueBox = event.target.closest('.legend-value-box');
  if (legendValueBox && infoPanelMode === 'colors') {
    options.onLegendValueBoxClick?.(legendValueBox);
    return true;
  }

  const historyRowButton = event.target.closest('[data-history-source-row-id]');
  if (historyRowButton && infoPanelMode === 'history') {
    options.onSelectHistoryRow?.(historyRowButton.getAttribute('data-history-source-row-id'));
    return true;
  }

  const historyNavButton = event.target.closest('[data-history-nav]');
  if (!historyNavButton || infoPanelMode !== 'history') {
    return false;
  }

  options.onHistoryNav?.(historyNavButton.getAttribute('data-history-nav'));
  return true;
}
