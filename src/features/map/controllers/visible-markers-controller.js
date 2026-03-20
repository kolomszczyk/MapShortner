import { isPointVisible as isPointVisibleUtil } from '../utils/marker-helpers.js';

export function createVisibleMarkerSyncController(options) {
  const windowObject = options?.windowObject || window;
  const requestAnimationFrameFn =
    options?.requestAnimationFrameFn ||
    ((callback) => windowObject.requestAnimationFrame(callback));
  const mapVisibleMarkerScanChunkSize = Number(options?.mapVisibleMarkerScanChunkSize || 400);
  const visibleBoundsPadding = Number(options?.visibleBoundsPadding || 0);
  const getMapInstance = options?.getMapInstance || (() => null);
  const getAllPeople = options?.getAllPeople || (() => []);
  const getAllCustomPoints = options?.getAllCustomPoints || (() => []);
  const shouldRenderPerson = options?.shouldRenderPerson || (() => true);
  const isPointVisible = options?.isPointVisible || isPointVisibleUtil;
  const applyVisibleMarkerDiff = options?.applyVisibleMarkerDiff || (() => {});

  let visibleMarkerSyncRequestToken = 0;
  let visibleMarkerSyncTimer = 0;

  function scheduleVisibleMarkerSync(delayMs = 0) {
    if (visibleMarkerSyncTimer) {
      windowObject.clearTimeout(visibleMarkerSyncTimer);
      visibleMarkerSyncTimer = 0;
    }

    const requestToken = ++visibleMarkerSyncRequestToken;
    const run = () => {
      visibleMarkerSyncTimer = 0;
      void syncVisibleMarkersAsync({ requestToken });
    };

    if (delayMs <= 0) {
      requestAnimationFrameFn(run);
      return;
    }

    visibleMarkerSyncTimer = windowObject.setTimeout(() => {
      requestAnimationFrameFn(run);
    }, delayMs);
  }

  async function syncVisibleMarkersAsync(options = {}) {
    const requestToken = Number(options.requestToken || 0);
    const mapInstance = getMapInstance();
    if (!mapInstance || (requestToken && requestToken !== visibleMarkerSyncRequestToken)) {
      return;
    }

    const bounds = mapInstance.getBounds().pad(visibleBoundsPadding);
    const nextPeople = [];
    const people = getAllPeople();
    for (let index = 0; index < people.length; index += 1) {
      if (requestToken && requestToken !== visibleMarkerSyncRequestToken) {
        return;
      }

      const person = people[index];
      if (isPointVisible(bounds, person) && shouldRenderPerson(person)) {
        nextPeople.push(person);
      }

      if ((index + 1) % mapVisibleMarkerScanChunkSize === 0) {
        await waitForNextAnimationFrame(requestAnimationFrameFn);
      }
    }

    const nextCustomPoints = [];
    const customPoints = getAllCustomPoints();
    for (let index = 0; index < customPoints.length; index += 1) {
      if (requestToken && requestToken !== visibleMarkerSyncRequestToken) {
        return;
      }

      const point = customPoints[index];
      if (isPointVisible(bounds, point)) {
        nextCustomPoints.push(point);
      }

      if ((index + 1) % mapVisibleMarkerScanChunkSize === 0) {
        await waitForNextAnimationFrame(requestAnimationFrameFn);
      }
    }

    if (requestToken && requestToken !== visibleMarkerSyncRequestToken) {
      return;
    }

    applyVisibleMarkerDiff(nextPeople, nextCustomPoints);
  }

  function syncVisibleMarkers() {
    const mapInstance = getMapInstance();
    if (!mapInstance) {
      return;
    }

    const bounds = mapInstance.getBounds().pad(visibleBoundsPadding);
    const nextPeople = getAllPeople().filter((person) => {
      return isPointVisible(bounds, person) && shouldRenderPerson(person);
    });
    const nextCustomPoints = getAllCustomPoints().filter((point) => isPointVisible(bounds, point));
    applyVisibleMarkerDiff(nextPeople, nextCustomPoints);
  }

  return {
    scheduleVisibleMarkerSync,
    syncVisibleMarkers,
    syncVisibleMarkersAsync
  };
}

function waitForNextAnimationFrame(requestAnimationFrameFn) {
  return new Promise((resolve) => {
    requestAnimationFrameFn(() => {
      resolve();
    });
  });
}
