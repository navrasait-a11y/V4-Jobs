import mongoose from 'mongoose';
import os from 'node:os';

/**
 * Mongo-backed distributed lock so scheduled tasks run on exactly one instance even when the API
 * is horizontally scaled (PM2 cluster / Kubernetes replicas).
 */
const lockSchema = new mongoose.Schema({ _id: String, owner: String, expiresAt: { type: Date, index: { expireAfterSeconds: 0 } } }, { versionKey: false });
const JobLock = mongoose.models.JobLock || mongoose.model('JobLock', lockSchema);

const OWNER = `${os.hostname()}:${process.pid}`;

export async function withLock(name, ttlMs, fn) {
  const now = new Date();
  try {
    await JobLock.findOneAndUpdate(
      { _id: name, $or: [{ expiresAt: { $lt: now } }, { owner: OWNER }] },
      { $set: { owner: OWNER, expiresAt: new Date(now.getTime() + ttlMs) } },
      { upsert: true, new: true },
    );
  } catch (err) {
    if (err.code === 11000) return { skipped: true }; // another instance holds the lock
    throw err;
  }
  try {
    return await fn();
  } finally {
    await JobLock.deleteOne({ _id: name, owner: OWNER }).catch(() => {});
  }
}
