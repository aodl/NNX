import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRegistryRegion } from '../src/data/topology/region-normalizer.js';

test('normalizes Zurich CH Registry region', () => {
  assert.deepEqual(normalizeRegistryRegion('Zurich, CH'), {
    rawRegion: 'Zurich, CH',
    cityOrRegion: 'Zurich',
    countryCode: 'CH',
    countryName: 'Switzerland',
    continent: 'Europe',
    unknown: false,
  });
});

test('normalizes Berlin DE Registry region', () => {
  assert.equal(normalizeRegistryRegion('Berlin, DE').countryName, 'Germany');
});

test('normalizes country-first Registry region', () => {
  const normalized = normalizeRegistryRegion('US, NY');
  assert.equal(normalized.countryCode, 'US');
  assert.equal(normalized.countryName, 'United States');
  assert.equal(normalized.cityOrRegion, 'NY');
  assert.equal(normalized.continent, 'North America');
});

test('normalizes continent-only Registry region', () => {
  const normalized = normalizeRegistryRegion('Europe');
  assert.equal(normalized.countryCode, null);
  assert.equal(normalized.countryName, null);
  assert.equal(normalized.continent, 'Europe');
  assert.equal(normalized.unknown, false);
});

test('normalizes empty and null Registry regions as unknown', () => {
  assert.equal(normalizeRegistryRegion('').unknown, true);
  assert.equal(normalizeRegistryRegion(null).unknown, true);
});

test('normalizes malformed Registry region as unknown', () => {
  assert.equal(normalizeRegistryRegion('{bad region}').unknown, true);
});

test('normalizes unknown country code without inventing continent', () => {
  const normalized = normalizeRegistryRegion('Somewhere, ZZ');
  assert.equal(normalized.countryCode, 'ZZ');
  assert.equal(normalized.countryName, null);
  assert.equal(normalized.continent, null);
  assert.equal(normalized.unknown, true);
});

test('normalizes unknown continent as unknown city or region only', () => {
  const normalized = normalizeRegistryRegion('Atlantis');
  assert.equal(normalized.cityOrRegion, 'Atlantis');
  assert.equal(normalized.countryCode, null);
  assert.equal(normalized.continent, null);
});
