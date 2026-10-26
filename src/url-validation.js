function normalizeHttpUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

module.exports = { normalizeHttpUrl };