import mongoose from 'mongoose';

/**
 * Runtime platform settings & third-party API keys managed from the admin panel.
 * Secret values are encrypted with AES-256-GCM before being stored.
 */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: mongoose.Schema.Types.Mixed,
    isSecret: { type: Boolean, default: false },
    group: { type: String, default: 'general', index: true },
    description: String,
    isPublic: { type: Boolean, default: false }, // exposed through GET /settings/public (web/app bootstrap)
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
export default Setting;
