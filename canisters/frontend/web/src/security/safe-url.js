const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

export function safeExternalUrl(value, { allowHttp = false } = {}) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || CONTROL_CHARS.test(trimmed)) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol === 'https:') return url.href;
  if (allowHttp && url.protocol === 'http:') return url.href;
  return null;
}
