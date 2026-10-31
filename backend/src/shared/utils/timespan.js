import ApiError from '../errors/ApiError.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const SPANS = {
  '24h': () => DAY,
  '1d': () => DAY,
  '2d': () => 2 * DAY,
  '5d': () => 5 * DAY,
  '7d': () => 7 * DAY,
  '14d': () => 14 * DAY,
  '15d': () => 15 * DAY,
  '30d': () => 30 * DAY,
  '45d': () => 45 * DAY,
  '90d': () => 90 * DAY,
  '120d': () => 120 * DAY,
  '2m': () => 60 * DAY,
  '4m': () => 120 * DAY,
  '6m': () => 182 * DAY,
  '9m': () => 273 * DAY,
  '12m': () => 365 * DAY,
  '1y': () => 365 * DAY,
  '2y': () => 730 * DAY,
};

/**
 * Converts the admin "Select Timespan" filter into a { from, to } range.
 * Supports presets (24h, 7d ... 12m), "today", "yesterday" and custom from/to ISO dates.
 * Returns null when no timespan was requested.
 */
export function resolveTimespan({ timespan, from, to } = {}) {
  const now = new Date();
  if (!timespan && !from && !to) return null;

  if (timespan === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start, to: now };
  }
  if (timespan === 'yesterday') {
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    return { from: new Date(end.getTime() - DAY), to: end };
  }
  if (timespan && timespan !== 'custom') {
    const fn = SPANS[timespan];
    if (!fn) throw ApiError.badRequest(`Unsupported timespan "${timespan}"`);
    return { from: new Date(now.getTime() - fn()), to: now };
  }

  const range = { from: from ? new Date(from) : new Date(0), to: to ? new Date(to) : now };
  if (Number.isNaN(range.from.getTime()) || Number.isNaN(range.to.getTime())) throw ApiError.badRequest('Invalid date range');
  if (range.from > range.to) throw ApiError.badRequest('"from" must be before "to"');
  return range;
}

export function dateRangeFilter(query, field = 'createdAt') {
  const range = resolveTimespan(query);
  return range ? { [field]: { $gte: range.from, $lte: range.to } } : {};
}

export const daysAgo = (n) => new Date(Date.now() - n * DAY);

/** Period bucket key used by usage quotas, e.g. daily -> 2026-10-17, monthly -> 2026-10. */
export function periodKey(period, date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  switch (period) {
    case 'daily':
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    case 'weekly': {
      const t = new Date(Date.UTC(y, m - 1, d));
      const dayNum = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((t - yearStart) / DAY + 1) / 7);
      return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    case 'monthly':
      return `${y}-${String(m).padStart(2, '0')}`;
    case 'quarterly':
      return `${y}-Q${Math.ceil(m / 3)}`;
    case 'yearly':
      return `${y}`;
    default:
      throw new Error(`Unknown period ${period}`);
  }
}
