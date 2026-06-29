import * as THREE from 'three';

const LAND_GEOJSON_URL = '/map/ne_110m_land.geojson';
const RADIUS = 1;
const FLAT_MAP_WIDTH = 2.72;
const FLAT_MAP_HEIGHT = 1.36;
const FLAT_CAMERA_Z = 2.6;
const VIEW_MODES = new Set(['globe', 'flat']);
const MARKER_COLORS = Object.freeze({
  add: { dot: 0x22c55e, halo: 0x86efac },
  remove: { dot: 0xef4444, halo: 0xfca5a5 },
  default: { dot: 0x3b82f6, halo: 0x93c5fd },
});
let landGeoJsonPromise = null;

function loadLandGeoJson() {
  landGeoJsonPromise ??= fetch(LAND_GEOJSON_URL).then((response) => {
    if (!response.ok) throw new Error(`Failed to load land geometry: ${response.status}`);
    return response.json();
  });
  return landGeoJsonPromise;
}

function normalizeViewMode(viewMode) {
  return VIEW_MODES.has(viewMode) ? viewMode : 'globe';
}

export function latLngToGlobeVector({ latitude, longitude }, radius = RADIUS) {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lng = THREE.MathUtils.degToRad(longitude);
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    radius * cosLat * Math.sin(lng),
    radius * Math.sin(lat),
    radius * cosLat * Math.cos(lng),
  );
}

export function latLngToFlatVector({ latitude, longitude }, z = 0) {
  return new THREE.Vector3(
    (longitude / 360) * FLAT_MAP_WIDTH,
    (latitude / 180) * FLAT_MAP_HEIGHT,
    z,
  );
}

function latLngToVector(gps, viewMode, offset = 0) {
  if (viewMode === 'flat') return latLngToFlatVector(gps, offset);
  return latLngToGlobeVector(gps, RADIUS + offset);
}

function ringCoordinates(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates;
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

function createLandLines(geoJson, viewMode) {
  const points = [];
  for (const feature of geoJson?.features ?? []) {
    for (const ring of ringCoordinates(feature.geometry)) {
      for (let index = 1; index < ring.length; index += 1) {
        const [leftLng, leftLat] = ring[index - 1];
        const [rightLng, rightLat] = ring[index];
        points.push(
          latLngToVector({ latitude: leftLat, longitude: leftLng }, viewMode, 0.004),
          latLngToVector({ latitude: rightLat, longitude: rightLng }, viewMode, 0.004),
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xa8b0ba,
    transparent: true,
    opacity: 0.74,
  });
  return new THREE.LineSegments(geometry, material);
}

function markerMaterials(markerRoot) {
  return markerRoot.children
    .map((child) => child.material)
    .filter(Boolean);
}

function setMarkerOpacity(markerRoot, opacity) {
  markerMaterials(markerRoot).forEach((material) => {
    material.opacity = (material.userData.baseOpacity ?? 1) * opacity;
    material.needsUpdate = true;
  });
}

function setMarkerDepth(markerRoot, depthTest) {
  markerMaterials(markerRoot).forEach((material) => {
    material.depthTest = depthTest;
    material.needsUpdate = true;
  });
}

function groupKey(group) {
  return group?.key ?? null;
}

function markerColors(group) {
  return MARKER_COLORS[group.proposalIntent] ?? MARKER_COLORS.default;
}

function markerIntent(group) {
  if (group?.proposalIntent === 'add') return 'add';
  if (group?.proposalIntent === 'remove') return 'remove';
  return 'other';
}

function createMarker(group, viewMode) {
  const markerRoot = new THREE.Group();
  markerRoot.userData = { locationGroup: group, baseOffset: viewMode === 'flat' ? 0.03 : 0.035 };
  markerRoot.position.copy(latLngToVector({
    latitude: group.gps.latitude,
    longitude: group.gps.longitude,
  }, viewMode, markerRoot.userData.baseOffset));
  if (viewMode === 'globe') markerRoot.lookAt(0, 0, 0);

  const markerSize = 0.007 + Math.min(0.012, Math.sqrt(group.nodeCount) * 0.0024);
  const colors = markerColors(group);
  const dotMaterial = new THREE.MeshBasicMaterial({
    color: colors.dot,
    transparent: true,
    opacity: 0.95,
  });
  dotMaterial.userData.baseOpacity = 0.95;
  const dotGeometry = viewMode === 'flat'
    ? new THREE.CircleGeometry(markerSize * 1.45, 24)
    : new THREE.SphereGeometry(markerSize, 16, 16);
  const dot = new THREE.Mesh(dotGeometry, dotMaterial);
  dot.userData = markerRoot.userData;
  markerRoot.add(dot);

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: colors.halo,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  haloMaterial.userData.baseOpacity = 0.24;
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(markerSize * 1.65, markerSize * 2.25, 28),
    haloMaterial,
  );
  halo.userData = markerRoot.userData;
  markerRoot.add(halo);

  return markerRoot;
}

function createFlatMapBase() {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(FLAT_MAP_WIDTH, FLAT_MAP_HEIGHT),
    new THREE.MeshBasicMaterial({
      color: 0x102c3d,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    }),
  );
}

function resizeRenderer(container, renderer, camera) {
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function clampTooltipPosition(tooltip, clientX, clientY) {
  const margin = 12;
  const offset = 14;
  const width = tooltip.offsetWidth || 300;
  const height = tooltip.offsetHeight || 180;
  const maxLeft = globalThis.innerWidth - width - margin;
  const maxTop = globalThis.innerHeight - height - margin;
  const left = Math.max(margin, Math.min(clientX + offset, maxLeft));
  const top = Math.max(margin, Math.min(clientY + offset, maxTop));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function field(label, value) {
  const row = document.createElement('div');
  row.className = 'subnet-globe-popover-row';
  const key = document.createElement('span');
  key.textContent = label;
  const val = document.createElement('strong');
  val.textContent = value ?? 'Unavailable';
  row.append(key, val);
  return row;
}

function renderPopoverContent(group) {
  const title = document.createElement('div');
  title.className = 'subnet-globe-popover-title';
  title.textContent = group.dataCenterId ?? 'Data center';

  const body = document.createElement('div');
  body.className = 'subnet-globe-popover-fields';
  const fields = [
    field('Nodes', group.nodeCount.toString()),
    field('Region', group.dataCenterRegion),
    field('Owner', group.dataCenterOwner),
    field('Node operators', group.nodeOperatorIds.length.toString()),
    field('Coordinates', group.gps ? `${group.gps.latitude}, ${group.gps.longitude}` : null),
  ];
  if (group.proposalIntent === 'add') {
    fields.unshift(field('Proposal', 'Intends to add node'));
  } else if (group.proposalIntent === 'remove') {
    fields.unshift(field('Proposal', 'Intends to remove node'));
  }
  if (group.proposalIntentCounts?.add > 0 || group.proposalIntentCounts?.remove > 0) {
    fields.push(field(
      'Intent nodes',
      `${group.proposalIntentCounts.add} add, ${group.proposalIntentCounts.remove} remove`,
    ));
  }
  body.append(...fields);

  const wrap = document.createDocumentFragment();
  wrap.append(title, body);
  return wrap;
}

export async function mountSubnetGlobe(container, locationGroups, options = {}) {
  const viewMode = normalizeViewMode(options.viewMode);
  let filters = {
    add: options.filters?.add !== false,
    remove: options.filters?.remove !== false,
    other: options.filters?.other !== false,
  };
  const groupsWithGps = locationGroups.filter((group) => group.gps);
  const groupsByKey = new Map(groupsWithGps.map((group) => [groupKey(group), group]));
  const controls = container.querySelector(':scope > .node-map-controls');
  for (const child of [...container.children]) {
    if (child !== controls) child.remove();
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'subnet-globe-canvas';
  container.insertBefore(canvas, controls);

  const tooltip = document.createElement('div');
  tooltip.className = 'subnet-globe-tooltip';
  tooltip.setAttribute('aria-hidden', 'true');
  document.body.append(tooltip);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0, viewMode === 'flat' ? FLAT_CAMERA_Z : 3.35);

  const globe = new THREE.Group();
  scene.add(globe);

  if (viewMode === 'flat') {
    globe.add(createFlatMapBase());
  } else {
    const ocean = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 72, 72),
      new THREE.MeshBasicMaterial({
        color: 0x102c3d,
        transparent: true,
        opacity: 0.96,
      }),
    );
    globe.add(ocean);

    const grid = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS + 0.002, 36, 18),
      new THREE.MeshBasicMaterial({
        color: 0x1c5566,
        wireframe: true,
        transparent: true,
        opacity: 0.1,
      }),
    );
    globe.add(grid);
  }

  try {
    globe.add(createLandLines(await loadLandGeoJson(), viewMode));
  } catch {
    const fallback = document.createElement('p');
    fallback.className = 'muted subnet-globe-fallback';
    fallback.textContent = 'Map geometry unavailable.';
    container.append(fallback);
  }

  const markerRoots = groupsWithGps.map((group) => createMarker(group, viewMode));
  markerRoots.forEach((marker) => globe.add(marker));

  if (viewMode === 'globe') {
    const activePoint = groupsWithGps.length > 0
      ? latLngToVector({
        latitude: groupsWithGps[0].gps.latitude,
        longitude: groupsWithGps[0].gps.longitude,
      }, viewMode)
      : latLngToVector({ latitude: 25, longitude: 0 }, viewMode);
    const target = new THREE.Quaternion().setFromUnitVectors(activePoint.normalize(), new THREE.Vector3(0, 0, 1));
    globe.quaternion.copy(target);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null;
  let selected = null;
  let dragging = false;
  let previousPointer = null;
  let pointerDown = null;
  let animationFrame = 0;
  let centerTarget = null;
  let disposed = false;

  function dispatchFocus(group, source = 'map') {
    container.dispatchEvent(new CustomEvent('subnet-map-focus', {
      detail: { groupKey: groupKey(group), source },
      bubbles: true,
    }));
  }

  function setPointer(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  }

  function activeGroup() {
    return selected ?? hovered;
  }

  function centerGlobeOnGroup(group) {
    if (viewMode !== 'globe' || !group?.gps) return;
    const activePoint = latLngToVector({
      latitude: group.gps.latitude,
      longitude: group.gps.longitude,
    }, viewMode);
    const target = new THREE.Quaternion().setFromUnitVectors(activePoint.normalize(), new THREE.Vector3(0, 0, 1));
    centerTarget = target;
  }

  function applyMarkerFocus(group) {
    markerRoots.forEach((marker) => {
      const markerGroup = marker.userData.locationGroup;
      const focused = group && markerGroup === group;
      setMarkerOpacity(marker, group && markerGroup !== group ? 0.16 : 1);
      setMarkerDepth(marker, !focused);
      marker.renderOrder = focused ? 10 : 0;
    });
  }

  function applyMarkerFilters(nextFilters = filters) {
    filters = {
      add: nextFilters?.add !== false,
      remove: nextFilters?.remove !== false,
      other: nextFilters?.other !== false,
    };
    markerRoots.forEach((marker) => {
      marker.visible = filters[markerIntent(marker.userData.locationGroup)] !== false;
    });
    if (activeGroup() && !filters[markerIntent(activeGroup())]) {
      selected = null;
      clearTooltip();
    }
  }

  function updateTooltip(event, group) {
    tooltip.textContent = '';
    tooltip.append(renderPopoverContent(group));
    tooltip.setAttribute('aria-hidden', 'false');
    clampTooltipPosition(tooltip, event.clientX, event.clientY);
    applyMarkerFocus(group);
  }

  function clearTooltip({ notify = true } = {}) {
    hovered = null;
    if (!selected) {
      tooltip.setAttribute('aria-hidden', 'true');
      applyMarkerFocus(null);
      if (notify) dispatchFocus(null);
    }
  }

  function focusGroup(group, event = null, { notify = false, persist = false, source = 'map' } = {}) {
    hovered = group;
    if (persist) selected = group;
    if (event) {
      updateTooltip(event, group);
    } else {
      tooltip.setAttribute('aria-hidden', 'true');
      applyMarkerFocus(group);
    }
    if (notify) dispatchFocus(group, source);
  }

  function handleExternalFocus(event) {
    const group = groupsByKey.get(event.detail?.groupKey) ?? null;
    const source = event.detail?.source ?? 'list';
    if (group) {
      if (source === 'list') centerGlobeOnGroup(group);
      focusGroup(group);
    } else {
      selected = null;
      clearTooltip({ notify: false });
    }
  }

  function handleFilterChange(event) {
    applyMarkerFilters(event.detail?.filters);
  }

  function intersectMarker(event) {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(markerRoots, true);
    for (const hit of hits) {
      const group = hit.object?.userData?.locationGroup ?? null;
      const marker = markerRoots.find((root) => root.userData.locationGroup === group);
      if (marker?.visible) return group;
    }
    return null;
  }

  function handlePointerMove(event) {
    if (pointerDown && !dragging) {
      pointerDown.moved += Math.abs(event.clientX - pointerDown.x) + Math.abs(event.clientY - pointerDown.y);
      pointerDown.x = event.clientX;
      pointerDown.y = event.clientY;
    }

    if (dragging && previousPointer) {
      const deltaX = event.clientX - previousPointer.x;
      const deltaY = event.clientY - previousPointer.y;
      if (pointerDown) {
        pointerDown.moved += Math.abs(deltaX) + Math.abs(deltaY);
      }
      if (viewMode === 'globe') {
        globe.rotation.y += deltaX * 0.006;
        globe.rotation.x += deltaY * 0.006;
        globe.rotation.x = Math.max(-1.2, Math.min(1.2, globe.rotation.x));
        previousPointer = { x: event.clientX, y: event.clientY };
        if (!selected) clearTooltip();
      }
      return;
    }

    const group = intersectMarker(event);
    if (group) {
      if (!selected) focusGroup(group, event, { notify: true, source: 'map' });
      canvas.style.cursor = 'pointer';
    } else if (hovered && !selected) {
      clearTooltip();
      canvas.style.cursor = viewMode === 'globe' && dragging ? 'grabbing' : 'default';
    }
  }

  function handlePointerDown(event) {
    dragging = viewMode === 'globe';
    if (dragging) centerTarget = null;
    previousPointer = { x: event.clientX, y: event.clientY };
    pointerDown = { x: event.clientX, y: event.clientY, moved: 0 };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.style.cursor = viewMode === 'globe' ? 'grabbing' : 'default';
  }

  function handlePointerUp(event) {
    const wasClick = pointerDown && pointerDown.moved < 5;
    const group = wasClick ? intersectMarker(event) : null;
    dragging = false;
    previousPointer = null;
    pointerDown = null;
    canvas.releasePointerCapture?.(event.pointerId);
    if (wasClick) {
      const toggledOff = selected === group;
      selected = toggledOff ? null : group;
      if (selected) {
        focusGroup(selected, event, { notify: true, persist: true, source: 'map' });
      } else if (toggledOff || !group) {
        clearTooltip();
      }
    }
    canvas.style.cursor = group ? 'pointer' : (viewMode === 'globe' ? 'grab' : 'default');
  }

  function render() {
    if (disposed) return;
    if (centerTarget) {
      globe.quaternion.rotateTowards(centerTarget, 0.18);
      if (globe.quaternion.angleTo(centerTarget) < 0.01) {
        globe.quaternion.copy(centerTarget);
        centerTarget = null;
      }
    }
    if (viewMode === 'globe' && !dragging && !activeGroup()) globe.rotation.y += 0.0014;
    renderer.render(scene, camera);
    animationFrame = globalThis.requestAnimationFrame(render);
  }

  const resizeObserver = new ResizeObserver(() => resizeRenderer(container, renderer, camera));
  resizeObserver.observe(container);
  resizeRenderer(container, renderer, camera);

  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointerleave', clearTooltip);
  container.addEventListener('subnet-map-request-focus', handleExternalFocus);
  container.addEventListener('subnet-map-filter-change', handleFilterChange);
  canvas.style.cursor = viewMode === 'globe' ? 'grab' : 'default';
  applyMarkerFilters(filters);
  render();

  return () => {
    disposed = true;
    globalThis.cancelAnimationFrame(animationFrame);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointerup', handlePointerUp);
    canvas.removeEventListener('pointerleave', clearTooltip);
    container.removeEventListener('subnet-map-request-focus', handleExternalFocus);
    container.removeEventListener('subnet-map-filter-change', handleFilterChange);
    tooltip.remove();
    renderer.dispose();
  };
}
