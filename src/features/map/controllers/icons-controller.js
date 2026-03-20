export function bindMapToolbarIcons(options = {}) {
  const onOpenInfoPanelMode =
    typeof options.onOpenInfoPanelMode === 'function' ? options.onOpenInfoPanelMode : () => false;
  const onFocusMapSearchInput =
    typeof options.onFocusMapSearchInput === 'function' ? options.onFocusMapSearchInput : () => {};
  const onToggleSettingsPanel =
    typeof options.onToggleSettingsPanel === 'function' ? options.onToggleSettingsPanel : () => {};

  options.selectionButtonEl?.addEventListener('click', () => {
    onOpenInfoPanelMode('selection');
  });

  options.searchButtonEl?.addEventListener('click', () => {
    if (!onOpenInfoPanelMode('search')) {
      onFocusMapSearchInput();
    }
  });

  options.listButtonEl?.addEventListener('click', () => {
    onOpenInfoPanelMode('list');
  });

  options.bookmarkedButtonEl?.addEventListener('click', () => {
    onOpenInfoPanelMode('bookmarked');
  });

  options.historyButtonEl?.addEventListener('click', () => {
    onOpenInfoPanelMode('history');
  });

  options.filterButtonEl?.addEventListener('click', () => {
    onOpenInfoPanelMode('filter');
  });

  options.colorsButtonEl?.addEventListener('click', () => {
    onOpenInfoPanelMode('colors');
  });

  options.settingsButtonEl?.addEventListener('click', () => {
    onToggleSettingsPanel();
  });
}