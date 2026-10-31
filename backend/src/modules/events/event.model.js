import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Job Event / Hiring drive: several jobs under one shareable page (link + QR code). */
const jobEventSchema = new Schema(
  {
    uid: { type: String, unique: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true },
    description: { type: String, maxlength: 10000 },
    banner: { key: String, url: String },
    mode: { type: String, enum: ['walk_in', 'virtual', 'hybrid'], default: 'walk_in' },
    venue: { address: String, city: String, state: String, pincode: String, mapUrl: String },
    meetingLink: String,
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    jobs: [{ type: Schema.Types.ObjectId, ref: 'Job' }],
    contact: { name: String, email: String, mobile: String },
    status: { type: String, enum: ['draft', 'published', 'closed', 'cancelled'], default: 'draft', index: true },
    stats: { views: { type: Number, default: 0 }, applications: { type: Number, default: 0 }, registrations: { type: Number, default: 0 } },
  },
  { timestamps: true },
);
jobEventSchema.index({ status: 1, startAt: 1 });

const JobEvent = mongoose.models.JobEvent || mongoose.model('JobEvent', jobEventSchema);
export default JobEvent;
