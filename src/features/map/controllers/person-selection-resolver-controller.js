export function createPersonSelectionResolverController(options) {
  const getPersonSelectionHistory = options?.getPersonSelectionHistory || (() => ({ entries: [], index: -1 }));
  const getActiveSelection = options?.getActiveSelection || (() => null);
  const readLastSelectedPersonId = options?.readLastSelectedPersonId || (() => null);

  function resolveVisiblePersonSelection(people) {
    if (!Array.isArray(people) || people.length === 0) {
      return null;
    }

    const personSelectionHistory = getPersonSelectionHistory();
    const currentPersonId = personSelectionHistory?.entries?.[personSelectionHistory?.index];
    if (currentPersonId) {
      const matchingPerson = people.find((person) => person.sourceRowId === currentPersonId);
      if (matchingPerson) {
        return matchingPerson;
      }
    }

    const activeSelection = getActiveSelection();
    const activePersonId = activeSelection?.type === 'person' ? activeSelection.key.replace(/^person:/, '') : null;
    if (activePersonId) {
      const activePerson = people.find((person) => person.sourceRowId === activePersonId);
      if (activePerson) {
        return activePerson;
      }
    }

    const lastSelectedPersonId = readLastSelectedPersonId();
    if (lastSelectedPersonId) {
      const lastSelectedPerson = people.find((person) => person.sourceRowId === lastSelectedPersonId);
      if (lastSelectedPerson) {
        return lastSelectedPerson;
      }
    }

    return people[0];
  }

  return {
    resolveVisiblePersonSelection
  };
}
