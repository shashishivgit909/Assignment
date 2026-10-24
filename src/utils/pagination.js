/**
 * Safe cursor serialization and deserialization utilities for keyset pagination.
 * Keyset pagination guarantees stable results without offset drift when records are inserted.
 */

function encodeCursor(createdAt, id) {
  const payload = {
    c: new Date(createdAt).toISOString(),
    i: id.toString()
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursorStr) {
  if (!cursorStr || typeof cursorStr !== 'string') {
    return null;
  }
  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.c || !parsed.i) {
      return null;
    }
    const date = new Date(parsed.c);
    if (isNaN(date.getTime())) {
      return null;
    }
    return {
      createdAt: date,
      id: parsed.i
    };
  } catch (err) {
    return null;
  }
}

module.exports = {
  encodeCursor,
  decodeCursor
};
