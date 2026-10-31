/**
 * Live check of the Cloudflare R2 setup: uploads through the real storage service, proves the
 * public file is reachable and the private file is not, then deletes both.
 * Usage: STORAGE_DRIVER=r2 in .env, then npm run r2:check
 */
import config from '../src/config/env.js';
import { putFile, deleteFile, publicUrl, signedUrl, readFile } from '../src/shared/services/storage.service.js';

if (config.storage.driver !== 'r2') {
  console.error('Set STORAGE_DRIVER=r2 in .env first.');
  process.exit(1);
}

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
};
const body = (text) => Buffer.from(`freejobwala r2 check ${text}`);
const statusOf = async (url) => (await fetch(url, { redirect: 'manual' })).status;

if (config.storage.r2.publicUrl.endsWith('.r2.dev')) {
  console.log('WARN  r2.dev is rate-limited and meant for development. Use a custom domain in production.');
}

const stored = [];
try {
  const pub = await putFile({ buffer: body('public'), mimetype: 'image/png', originalname: 'check.png', size: 28 }, { folder: 'r2-check' });
  stored.push(pub.key);
  check(true, 'upload to public bucket');
  const res = await fetch(publicUrl(pub.key));
  check(res.status === 200, `public file opens on ${config.storage.r2.publicUrl} (HTTP ${res.status})`);
  check(res.headers.get('content-type') === 'image/png', 'public file keeps its content type');

  const name = 'Resume check.pdf';
  const priv = await putFile({ buffer: body('private'), mimetype: 'application/pdf', originalname: name, size: 29 }, { folder: 'r2-check', isPrivate: true });
  stored.push(priv.key);
  check(true, 'upload to private bucket');
  const signed = await signedUrl(priv.key, 60, name);
  const dl = await fetch(signed);
  check(dl.status === 200 && (await dl.text()) === body('private').toString(), `signed URL downloads the private file (HTTP ${dl.status})`);
  check(String(dl.headers.get('content-disposition')).includes('Resume%20check.pdf'), 'signed URL keeps the download name');
  const leak = await statusOf(`${config.storage.r2.publicUrl}/${priv.key}`);
  check(leak !== 200, `private file is NOT reachable on the public domain (HTTP ${leak})`);
  const unsigned = await statusOf(signed.split('?')[0]);
  check(unsigned !== 200, `private file is NOT reachable without a signature (HTTP ${unsigned})`);
  check((await readFile(priv.key)).equals(body('private')), 'server can read the private file');
} catch (err) {
  check(false, `${err.name}: ${err.message}`);
} finally {
  for (const key of stored) await deleteFile(key);
}
const privateKey = stored.find((key) => key.startsWith('private/'));
if (privateKey) {
  const gone = await statusOf(await signedUrl(privateKey, 60));
  check(gone === 404, `test files deleted (HTTP ${gone})`);
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nR2 setup is working.');
process.exit(failed ? 1 : 0);
