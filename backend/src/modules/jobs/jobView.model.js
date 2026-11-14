import mongoose from 'mongoose';

/**
 * One row per (job, visitor, day), so a job's view count means "people who opened it", not page
 * loads: refreshes, back-and-forth and repeat visits on the same day count once. Rows expire after
 * two days; only the counter on the job is kept.
 */
const jobViewSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    visitor: { type: String, required: true }, // user id, or a hash of IP + browser for guests
    day: { type: String, required: true }, // yyyy-mm-dd (IST)
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
jobViewSchema.index({ job: 1, visitor: 1, day: 1 }, { unique: true });
jobViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 3600 });

export const JobView = mongoose.models.JobView || mongoose.model('JobView', jobViewSchema);
export default JobView;
