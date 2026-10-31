/**
 * Moves files from local disk to Cloudflare R2 and repoints the database at them.
 *   npm run r2:migrate            dry run: reports what would change, writes nothing
 *   npm run r2:migrate -- --apply copies the files, then rewrites stored public URLs
 *
 * Keys do not change, so private files (stored by key only) need no database update. Public files
 * also store a full URL, including inside CMS HTML, so every collection is scanned for those.
 * Files no record uses (leftover test uploads) are skipped. Local files are never deleted, and
 * running it again is safe.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import mongoose from '../src/config/database.js';
import { copyToR2 } from '../src/shared/services/storage.service.js';
import { FILE_KEY, findReferencedKeys, isPlain } from './lib/media-keys.js';

const MIME = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
};

const LOCAL_URL = /https?:\/\/[^\s"'<>/]+\/uploads\/(public\/[^\s"'<>)?#]+)/g;

async function listLocalKeys(root) {
  const entries = await fs.readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .filter((key) => FILE_KEY.test(key));
}

/** Returns the value with local URLs swapped. ObjectIds, dates and buffers pass through untouched. */
function rewrite(value, ctx) {
  if (typeof value === 'string') {
    if (FILE_KEY.test(value) && !ctx.local.has(value)) ctx.missing.add(value);
    return value.replace(LOCAL_URL, (url, key) => {
      if (ctx.local.has(key)) return `${ctx.publicUrl}/${key}`;
      if (url.startsWith(config.urls.app) || /\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) ctx.missing.add(key);
      return url;
    });
  }
  if (Array.isArray(value)) return value.map((v) => rewrite(v, ctx));
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, ctx)]));
  return value;
}

const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

export async function migrateUploads({ db, root, publicUrl, apply = false }) {
  const keys = await listLocalKeys(root);
  const referenced = await findReferencedKeys(db);
  const toCopy = keys.filter((key) => referenced.has(key));
  const report = { files: keys.length, skipped: keys.length - toCopy.length, copied: 0, documents: 0, collections: {}, missing: [] };

  // Copy first: if this fails, the database still points at files that exist.
  if (apply) {
    for (const key of toCopy) {
      await copyToR2(key, await fs.readFile(path.join(root, key)), MIME[path.extname(key).toLowerCase()] || 'application/octet-stream');
      report.copied += 1;
    }
  }

  const ctx = { local: new Set(keys), publicUrl, missing: new Set() };
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    const col = db.collection(name);
    for await (const doc of col.find({})) {
      const set = {};
      for (const [field, value] of Object.entries(doc)) {
        if (field === '_id') continue;
        const next = rewrite(value, ctx);
        if (changed(value, next)) set[field] = next;
      }
      if (!Object.keys(set).length) continue;
      report.documents += 1;
      report.collections[name] = (report.collections[name] || 0) + 1;
      if (apply) await col.updateOne({ _id: doc._id }, { $set: set });
    }
  }
  report.missing = [...ctx.missing];
  return report;
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && config.storage.driver !== 'r2') {
    console.error('Fill the R2_* keys and set STORAGE_DRIVER=r2 in .env first.');
    process.exit(1);
  }
  await connectDatabase();
  const report = await migrateUploads({
    db: mongoose.connection.db,
    root: path.resolve(config.storage.localDir),
    publicUrl: config.storage.r2.publicUrl,
    apply,
  });
  console.log(apply ? 'MIGRATED' : 'DRY RUN - nothing was changed');
  console.log(`Local files: ${report.files}, not used by any record (skipped): ${report.skipped}${apply ? `, copied to R2: ${report.copied}` : ''}`);
  console.log(`Documents with local URLs: ${report.documents}`, report.collections);
  if (report.missing.length) {
    console.log(`\nReferenced in the database but not on this disk (${report.missing.length}). These will not open:`);
    report.missing.forEach((key) => console.log(`  ${key}`));
  }
  if (!apply) console.log('\nTo run it: npm run r2:migrate -- --apply');
  await disconnectDatabase();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
