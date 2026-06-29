export function formatSubnetType(value) {
  if (typeof value !== 'string' || value.length === 0) return 'Unknown';
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function capitalizeFirstLetter(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
