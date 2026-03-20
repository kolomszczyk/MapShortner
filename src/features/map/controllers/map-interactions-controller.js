export function bindMapInteractions(options = {}) {
  const mapEl = options.mapEl;
  if (!mapEl) {
    return;
  }

  const onCopyPersonId =
    typeof options.onCopyPersonId === 'function' ? options.onCopyPersonId : () => {};
  const onOpenPopupPerson =
    typeof options.onOpenPopupPerson === 'function' ? options.onOpenPopupPerson : () => {};

  mapEl.addEventListener('click', (event) => {
    const copyPersonIdControl = event.target.closest('[data-map-copy-person-id]');
    if (copyPersonIdControl) {
      event.preventDefault();
      event.stopPropagation();
      onCopyPersonId(copyPersonIdControl.getAttribute('data-map-copy-person-id'));
      return;
    }

    const popupPersonEntry = event.target.closest('[data-map-popup-person-source-row-id]');
    if (!popupPersonEntry) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onOpenPopupPerson(popupPersonEntry.getAttribute('data-map-popup-person-source-row-id'));
  });

  mapEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const copyPersonIdControl = event.target.closest('[data-map-copy-person-id]');
    if (copyPersonIdControl) {
      event.preventDefault();
      event.stopPropagation();
      onCopyPersonId(copyPersonIdControl.getAttribute('data-map-copy-person-id'));
      return;
    }

    const popupPersonEntry = event.target.closest('[data-map-popup-person-source-row-id]');
    if (!popupPersonEntry) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onOpenPopupPerson(popupPersonEntry.getAttribute('data-map-popup-person-source-row-id'));
  });
}