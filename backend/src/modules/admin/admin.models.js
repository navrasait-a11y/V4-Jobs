import mongoose from 'mongoose';
import { SCREENING_STATUS, CALLING_STATUS, MESSAGING_STATUS, FORWARD_CHANNELS } from '../../shared/constants/index.js';

const { Schema } = mongoose;

/** Portal-admin screening / calling / messaging tracking + comments on any candidate or employer. */
const adminTrackingSchema = new Schema(
  {
    targetType: { type: String, enum: ['candidate', 'organization'], required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    screeningStatus: { type: String, enum: SCREENING_STATUS },
    callingStatus: { type: String, enum: CALLING_STATUS },
    messagingStatus: [{ type: String, enum: MESSAGING_STATUS }],
    forwardedVia: [
      {
        channel: { type: String, enum: FORWARD_CHANNELS },
        to: String,
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    comments: [{ body: String, by: { type: Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }],
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
adminTrackingSchema.index({ targetType: 1, user: 1 }, { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } });
adminTrackingSchema.index({ targetType: 1, organization: 1 }, { unique: true, partialFilterExpression: { organization: { $type: 'objectId' } } });

export const AdminTracking = mongoose.models.AdminTracking || mongoose.model('AdminTracking', adminTrackingSchema);
