import {
  addNote,
  getPersonDetails,
  listPeople,
  openPersonInAccess
} from '../../shared/data/app-api.js';

export function fetchPeopleList(input = {}) {
  return listPeople(input);
}

export function fetchPersonDetails(sourceRowId) {
  return getPersonDetails(sourceRowId);
}

export function savePersonNote(payload) {
  return addNote(payload);
}

export function openPersonInAccessById(payload) {
  return openPersonInAccess(payload);
}