import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from '../../config/env.js';
import logger from '../../config/logger.js';
import { hmacSha256, safeEqual } from '../utils/crypto.js';

/**
 * Storage abstraction: Cloudflare R2 in production, local disk in development. Files are either
 * public (logos, avatars, blog images) or private (resumes, KYC documents, chat files). R2 public
 * access covers a whole bucket, so each kind has its own bucket and private files are only
 * reachable through short-lived signed URLs.
 */
const isR2 = config.storage.driver === 'r2';
const { r2 } = config.storage;
const s3 = isR2
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  : null;

const LOCAL_ROOT = path.resolve(config.storage.localDir);

const bucketFor = (key) => (key.startsWith('private/') ? r2.privateBucket : r2.publicBucket);

/** RFC 5987 header value, so spaces and Hindi file names survive the download. */
const attachment = (name) => `attachment; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`;

const EXT = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/csv': '.csv',
};

function buildKey(folder, mime, isPrivate) {
  const id = crypto.randomUUID();
  const d = new Date();
  return `${isPrivate ? 'private' : 'public'}/${folder}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${id}${EXT[mime] || ''}`;
}

export function publicUrl(key) {
  if (!key) return null;
  if (isR2) return `${r2.publicUrl}/${key}`;
  return `${config.urls.app}/uploads/${key}`;
}

function putR2Object(key, body, mime, name) {
  const isPrivate = key.startsWith('private/');
  return s3.send(
    new PutObjectCommand({
      Bucket: bucketFor(key),
      Key: key,
      Body: body,
      ContentType: mime,
      ContentDisposition: isPrivate ? attachment(name || 'file') : undefined,
      CacheControl: isPrivate ? 'private, max-age=0' : 'public, max-age=31536000, immutable',
    }),
  );
}

/** Copies a file that already has a key to R2, keeping the key (see scripts/migrate-uploads-r2.js). */
export const copyToR2 = (key, buffer, mime) => putR2Object(key, buffer, mime, path.posix.basename(key));

/** Uploads a multer file (memory). Returns metadata to persist on the owning document. */
export async function putFile(file, { folder = 'misc', isPrivate = false } = {}) {
  const key = buildKey(folder, file.mimetype, isPrivate);
  if (isR2) {
    await putR2Object(key, file.buffer, file.mimetype, file.originalname);
  } else {
    const full = path.join(LOCAL_ROOT, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, file.buffer);
  }
  return {
    key,
    url: isPrivate ? null : publicUrl(key),
    name: String(file.originalname || '').slice(0, 200),
    size: file.size,
    mime: file.mimetype,
    isPrivate,
    uploadedAt: new Date(),
  };
}

/** Deletes a file and throws when the store refuses. Deleting a missing file is not an error. */
export async function removeFile(key) {
  try {
    if (isR2) await s3.send(new DeleteObjectCommand({ Bucket: bucketFor(key), Key: key }));
    else await fs.unlink(path.join(LOCAL_ROOT, key));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export async function deleteFile(key) {
  if (!key) return;
  // A failed clean-up must not fail the user's request.
  await removeFile(key).catch((err) => logger.warn({ err, key }, 'storage delete failed'));
}

/** Short-lived download URL for private files (resumes / KYC / chat attachments). */
export async function signedUrl(key, expiresInSec = 600, downloadName) {
  if (!key) return null;
  if (!key.startsWith('private/')) return publicUrl(key);
  if (isR2) {
    return getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucketFor(key),
        Key: key,
        ResponseContentDisposition: downloadName ? attachment(downloadName) : undefined,
      }),
      { expiresIn: expiresInSec },
    );
  }
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const sig = hmacSha256(config.encryptionKey, `${key}:${exp}`);
  return `${config.urls.app}${config.apiPrefix}/files/download?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}`;
}

/** Verifies a local signed URL and returns the absolute file path. */
export function resolveLocalSigned({ key, exp, sig }) {
  if (!key || !exp || !sig) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  if (!safeEqual(sig, hmacSha256(config.encryptionKey, `${key}:${exp}`))) return null;
  const full = path.resolve(LOCAL_ROOT, key);
  if (!full.startsWith(LOCAL_ROOT)) return null; // path traversal guard
  return full;
}

export async function readFile(key) {
  if (isR2) {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucketFor(key), Key: key }));
    return Buffer.from(await out.Body.transformToByteArray());
  }
  return fs.readFile(path.join(LOCAL_ROOT, key));
}

export const storageRoot = LOCAL_ROOT;
