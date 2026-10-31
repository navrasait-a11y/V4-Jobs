import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } }, { versionKey: false });

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

/**
 * Atomic, gap-free (per prefix) sequence. Safe across multiple app instances
 * because the increment happens inside MongoDB.
 */
export async function nextSequence(key, session) {
  const doc = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
  return doc.seq;
}

/** Generates IDs in the PRD format: PREFIX-DDMMYYYY000001 (e.g. COMP-17102026000001). */
export async function generateUid(prefix, date = new Date(), session) {
  const seq = await nextSequence(`uid:${prefix}`, session);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${prefix}-${dd}${mm}${yyyy}${String(seq).padStart(6, '0')}`;
}

export default Counter;
