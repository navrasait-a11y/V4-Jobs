import mongoose from 'mongoose';

const { Schema } = mongoose;

const participantSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, required: true }, // candidate | employer | admin
    organization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    unread: { type: Number, default: 0 },
    lastReadAt: Date,
    mutedUntil: Date,
    archived: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * direct  : candidate <-> employer member (one per candidate + organization)
 * support : any user <-> portal admin / customer support team
 */
const conversationSchema = new Schema(
  {
    type: { type: String, enum: ['direct', 'support'], required: true, index: true },
    participants: [participantSchema],
    participantIds: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job' },
    subject: String,
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    assignedAdmin: { type: Schema.Types.ObjectId, ref: 'User' },
    lastMessage: { body: String, type: { type: String }, sender: { type: Schema.Types.ObjectId, ref: 'User' }, at: Date },
    lastMessageAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);
conversationSchema.index({ type: 1, organization: 1, candidate: 1 });

const messageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: String,
    type: { type: String, enum: ['text', 'image', 'file', 'system'], default: 'text' },
    body: { type: String, maxlength: 5000 },
    attachments: [{ key: String, url: String, name: String, mime: String, size: Number, _id: false }],
    clientId: String, // client-generated id for optimistic UI / de-duplication
    readBy: [{ user: { type: Schema.Types.ObjectId, ref: 'User' }, at: Date, _id: false }],
    editedAt: Date,
    deletedAt: Date,
  },
  { timestamps: true },
);
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

export const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
