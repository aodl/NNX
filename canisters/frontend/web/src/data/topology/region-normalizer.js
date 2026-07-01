const COUNTRIES = Object.freeze({
  CH: { name: 'Switzerland', continent: 'Europe' },
  DE: { name: 'Germany', continent: 'Europe' },
  FR: { name: 'France', continent: 'Europe' },
  US: { name: 'United States', continent: 'North America' },
  CA: { name: 'Canada', continent: 'North America' },
  GB: { name: 'United Kingdom', continent: 'Europe' },
  NL: { name: 'Netherlands', continent: 'Europe' },
  BE: { name: 'Belgium', continent: 'Europe' },
  ES: { name: 'Spain', continent: 'Europe' },
  SE: { name: 'Sweden', continent: 'Europe' },
  SG: { name: 'Singapore', continent: 'Asia' },
  JP: { name: 'Japan', continent: 'Asia' },
  AU: { name: 'Australia', continent: 'Oceania' },
  ZA: { name: 'South Africa', continent: 'Africa' },
  BR: { name: 'Brazil', continent: 'South America' },
});

const COUNTRY_NAMES = new Map(Object.entries(COUNTRIES).map(([code, value]) => [
  value.name.toLowerCase(),
  { code, ...value },
]));

const CONTINENTS = new Set([
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'Oceania',
  'South America',
]);

function titleCase(value) {
  return value.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function countryFromToken(token) {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) {
    const country = COUNTRIES[upper];
    return country ? { countryCode: upper, countryName: country.name, continent: country.continent } : {
      countryCode: upper,
      countryName: null,
      continent: null,
    };
  }
  const named = COUNTRY_NAMES.get(trimmed.toLowerCase());
  if (named) return { countryCode: named.code, countryName: named.name, continent: named.continent };
  return null;
}

export function normalizeRegistryRegion(rawRegion) {
  const raw = typeof rawRegion === 'string' ? rawRegion.trim() : '';
  const empty = {
    rawRegion: raw || null,
    cityOrRegion: null,
    countryCode: null,
    countryName: null,
    continent: null,
    unknown: true,
  };
  if (!raw) return empty;

  const continent = [...CONTINENTS].find((item) => item.toLowerCase() === raw.toLowerCase());
  if (continent) {
    return { ...empty, continent, unknown: false };
  }

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.some((part) => /[{}[\]<>]/.test(part))) return empty;

  const firstCountry = countryFromToken(parts[0]);
  const lastCountry = countryFromToken(parts[parts.length - 1]);
  const country = firstCountry?.continent || parts.length === 1 ? firstCountry : lastCountry;
  const cityOrRegion = firstCountry?.continent && parts.length > 1
    ? parts.slice(1).join(', ')
    : parts.slice(0, -1).join(', ') || null;

  if (country) {
    return {
      rawRegion: raw,
      cityOrRegion,
      countryCode: country.countryCode,
      countryName: country.countryName,
      continent: country.continent,
      unknown: !country.countryName && !country.continent,
    };
  }

  if (parts.length === 1 && /^[A-Za-z][A-Za-z .'-]{1,}$/.test(parts[0])) {
    return {
      ...empty,
      cityOrRegion: titleCase(parts[0]),
    };
  }

  return empty;
}
