const EARTH_RADIUS_KM = 6371;

function radians(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(left, right) {
  const dLat = radians(right.latitude - left.latitude);
  const dLon = radians(right.longitude - left.longitude);
  const lat1 = radians(left.latitude);
  const lat2 = radians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function statsFor(nodeIds, nodesById, dataWarnings) {
  const points = [];
  for (const nodeId of nodeIds) {
    const gps = nodesById[nodeId]?.gps;
    if (!gps) {
      dataWarnings.push({ message: 'Registry GPS metadata is missing for a node.', nodeId });
      continue;
    }
    points.push(gps);
  }
  if (points.length < 2) return { minKm: 0, avgKm: 0, maxKm: 0, pairCount: 0, missingGpsCount: nodeIds.length - points.length };
  const distances = [];
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      distances.push(haversineKm(points[left], points[right]));
    }
  }
  return {
    minKm: Math.min(...distances),
    avgKm: distances.reduce((total, value) => total + value, 0) / distances.length,
    maxKm: Math.max(...distances),
    pairCount: distances.length,
    missingGpsCount: nodeIds.length - points.length,
  };
}

export function computeDistanceMetric({ beforeNodeIds = [], afterNodeIds = [], nodesById = {} } = {}) {
  const dataWarnings = [];
  return {
    before: statsFor(beforeNodeIds, nodesById, dataWarnings),
    after: statsFor(afterNodeIds, nodesById, dataWarnings),
    dataWarnings,
  };
}
