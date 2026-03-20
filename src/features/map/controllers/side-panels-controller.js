export function bindSidePanelControls(options = {}) {
  const onFocusSelection =
    typeof options.onFocusSelection === 'function' ? options.onFocusSelection : () => {};
  const onToggleSelectionBookmark =
    typeof options.onToggleSelectionBookmark === 'function' ? options.onToggleSelectionBookmark : async () => {};
  const onPanelClick =
    typeof options.onPanelClick === 'function' ? options.onPanelClick : () => {};

  options.selectionFocusButtonEl?.addEventListener('click', () => {
    onFocusSelection();
  });

  options.selectionBookmarkButtonEl?.addEventListener('click', async () => {
    await onToggleSelectionBookmark();
  });

  options.selectionExtraEl?.addEventListener('click', onPanelClick);
  options.selectionMetaEl?.addEventListener('click', onPanelClick);
}