import { Blocklist, UserBlock } from './moderation.models.js';
import ApiError from '../../shared/errors/ApiError.js';

/** Throws if any supplied identity attribute is on the admin blocklist. */
export async function assertNotBlocklisted({ email, mobile, name, gst, country, url, ip } = {}) {
  const checks = [];
  if (email) {
    checks.push({ type: 'email', value: email.toLowerCase() });
    checks.push({ type: 'domain', value: email.split('@')[1]?.toLowerCase() });
  }
  if (mobile) checks.push({ type: 'mobile', value: String(mobile) });
  if (name) checks.push({ type: 'name', value: name.trim().toLowerCase() });
  if (gst) checks.push({ type: 'gst', value: gst.toLowerCase() });
  if (country) checks.push({ type: 'country', value: country.toLowerCase() });
  if (url) {
    checks.push({ type: 'url', value: url.toLowerCase() });
    try {
      checks.push({ type: 'domain', value: new URL(url).hostname.replace(/^www\./, '').toLowerCase() });
    } catch {
      /* not a URL */
    }
  }
  if (ip) checks.push({ type: 'ip', value: ip });
  const valid = checks.filter((c) => c.value);
  if (!valid.length) return;
  const hit = await Blocklist.findOne({ $or: valid }).lean();
  if (hit) throw ApiError.forbidden('Registration is not allowed for these details. Contact support.', 'BLOCKLISTED');
}

/** True if either side has blocked the other (used by apply, search, chat). */
export async function isBlockedBetween({ candidateUserId, organizationId }) {
  if (!candidateUserId || !organizationId) return false;
  return Boolean(
    await UserBlock.exists({
      $or: [
        { blockerUser: candidateUserId, targetType: 'organization', targetOrganization: organizationId },
        { blockerOrganization: organizationId, targetType: 'candidate', targetUser: candidateUserId },
      ],
    }),
  );
}

/** Candidate user ids that an organization must not see (blocked either way). */
export async function hiddenCandidateIdsFor(organizationId) {
  const rows = await UserBlock.find({
    $or: [
      { blockerOrganization: organizationId, targetType: 'candidate' },
      { targetType: 'organization', targetOrganization: organizationId },
    ],
  })
    .select('blockerUser targetUser targetType')
    .lean();
  return rows.map((r) => (r.targetType === 'candidate' ? r.targetUser : r.blockerUser)).filter(Boolean);
}

/** Organizations a candidate must not see (blocked either way). */
export async function hiddenOrganizationIdsFor(candidateUserId) {
  const rows = await UserBlock.find({
    $or: [
      { blockerUser: candidateUserId, targetType: 'organization' },
      { targetType: 'candidate', targetUser: candidateUserId },
    ],
  })
    .select('targetOrganization blockerOrganization targetType')
    .lean();
  return rows.map((r) => (r.targetType === 'organization' ? r.targetOrganization : r.blockerOrganization)).filter(Boolean);
}
