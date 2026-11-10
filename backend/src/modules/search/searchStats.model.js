import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Daily, anonymous counters per search term (no user, no IP). Feeds "Trending searches" and the admin
 * search insights. Kept for 180 days.
 */
const searchStatSchema = new Schema(
  {
    term: { type: String, required: true, maxlength: 80 },
    scope: { type: String, enum: ['jobs', 'candidates'], required: true },
    day: { type: String, required: true }, // YYYY-MM-DD (UTC)
    date: { type: Date, required: true },
    searches: { type: Number, default: 0 },
    zero: { type: Number, default: 0 }, // searches that found nothing
    picks: { type: Number, default: 0 }, // chosen from the suggestion list
  },
  { versionKey: false },
);
searchStatSchema.index({ term: 1, scope: 1, day: 1 }, { unique: true });
searchStatSchema.index({ scope: 1, date: -1 });
searchStatSchema.index({ date: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

export const SearchStat = mongoose.models.SearchStat || mongoose.model('SearchStat', searchStatSchema);
