/** Finds storage keys inside database documents, as plain key fields or inside public URLs and HTML. */
export const FILE_KEY = /^(public|private)\/[^\s]+\.[a-z0-9]+$/i;
const PUBLIC_KEY_IN_URL = /\/(public\/[^\s"'<>)?#]+\.[a-z0-9]+)/gi;

export const isPlain = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

export function collectKeys(value, out = new Set()) {
  if (typeof value === 'string') {
    if (FILE_KEY.test(value)) out.add(value);
    for (const [, key] of value.matchAll(PUBLIC_KEY_IN_URL)) out.add(key);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectKeys(v, out));
  } else if (isPlain(value)) {
    Object.values(value).forEach((v) => collectKeys(v, out));
  }
  return out;
}

/** Every key still referenced anywhere in the database. */
export async function findReferencedKeys(db, skip = []) {
  const out = new Set();
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith('system.') || skip.includes(name)) continue;
    for await (const doc of db.collection(name).find({})) collectKeys(doc, out);
  }
  return out;
}
