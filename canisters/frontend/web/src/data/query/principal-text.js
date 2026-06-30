import { Principal } from '@icp-sdk/core/principal';

export function normalizePrincipalText(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    return Principal.fromText(value).toText();
  } catch {
    return null;
  }
}
