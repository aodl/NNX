import assert from 'node:assert/strict';
import test from 'node:test';
import { latLngToFlatVector, latLngToGlobeVector } from '../src/ui/subnet-globe.js';

test('globe projection places coordinates on the requested radius', () => {
  const point = latLngToGlobeVector({ latitude: 0, longitude: 0 }, 2);
  assert.equal(point.x, 0);
  assert.equal(point.y, 0);
  assert.equal(point.z, 2);
  assert.equal(Number(point.length().toFixed(6)), 2);
});

test('flat projection maps longitude and latitude to a rectangle', () => {
  const center = latLngToFlatVector({ latitude: 0, longitude: 0 });
  assert.equal(center.x, 0);
  assert.equal(center.y, 0);
  assert.equal(center.z, 0);

  const northEast = latLngToFlatVector({ latitude: 90, longitude: 180 }, 0.25);
  assert.equal(Number(northEast.x.toFixed(2)), 1.36);
  assert.equal(Number(northEast.y.toFixed(2)), 0.68);
  assert.equal(northEast.z, 0.25);
});
