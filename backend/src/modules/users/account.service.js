import mongoose from 'mongoose';
import User from './user.model.js';
import Candidate from '../candidates/candidate.model.js';
import Organization from '../employers/organization.model.js';
import { generateUid } from '../../shared/models/counter.model.js';
import { ROLES, USER_STATUS, ID_PREFIX, EMPLOYER_TYPE, USERNAME_REGEX } from '../../shared/constants/index.js';
import { normalizeEmail, normalizeMobile, uniqueSlug, slugify } from '../../shared/utils/helpers.js';
import { randomToken } from '../../shared/utils/crypto.js';
import ApiError from '../../shared/errors/ApiError.js';
import { assertNotBlocklisted } from '../moderation/blocklist.service.js';
import { getSetting } from '../settings/settings.service.js';

export async function assertIdentityAvailable({ email, mobile, username }, excludeUserId) {
  const or = [];
  if (email) or.push({ email: normalizeEmail(email) });
  if (mobile) or.push({ mobile: normalizeMobile(mobile) });
  if (username) or.push({ username });
  if (!or.length) return;
  const existing = await User.findOne({ $or: or, ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}) })
    .select('email mobile username')
    .lean();
  if (!existing) return;
  if (email && existing.email === normalizeEmail(email)) throw ApiError.conflict('An account with this e-mail already exists', 'EMAIL_TAKEN');
  if (mobile && existing.mobile === normalizeMobile(mobile)) throw ApiError.conflict('An account with this mobile number already exists', 'MOBILE_TAKEN');
  throw ApiError.conflict('Username is already taken', 'USERNAME_TAKEN');
}

export function validateUsername(username) {
  if (!USERNAME_REGEX.test(username)) {
    throw ApiError.badRequest(
      'Username must be 3-30 characters, letters/numbers/underscore only, and cannot start or end with an underscore',
      undefined,
      'INVALID_USERNAME',
    );
  }
}

/** Generates a unique, rule-compliant username from a name (used for auto-created accounts). */
export async function generateUsername(base) {
  const root = (
    slugify(base)
      .replace(/-/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/^_+|_+$/g, '') || 'user'
  ).slice(0, 20);
  for (let i = 0; i < 6; i += 1) {
    const candidate = `${root.length < 3 ? `${root}usr` : root}${Math.floor(1000 + Math.random() * 899999)}`.slice(0, 30);
    if (!(await User.exists({ username: candidate }))) return candidate;
  }
  return `user${randomToken(6)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()}`;
}

const referralCode = () =>
  randomToken(6)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);

/**
 * Creates a candidate user + profile atomically.
 * Used by: self registration, Google sign-up, apply-without-login, job alert, events, admin bulk import.
 */
export async function createCandidateAccount(data, { source = 'direct', status = USER_STATUS.ACTIVE, ip, session: outerSession } = {}) {
  const email = normalizeEmail(data.email);
  const mobile = normalizeMobile(data.mobile);
  await assertNotBlocklisted({ email, mobile, name: data.fullName, ip });
  await assertIdentityAvailable({ email, mobile, username: data.username });
  if (data.username) validateUsername(data.username);

  const run = async (session) => {
    const uid = await generateUid(ID_PREFIX.candidate, new Date(), session);
    const [user] = await User.create(
      [
        {
          uid,
          role: ROLES.CANDIDATE,
          fullName: data.fullName,
          displayName: data.displayName || data.fullName,
          username: data.username || (await generateUsername(data.fullName || email || 'candidate')),
          gender: data.gender,
          email,
          mobile,
          countryCode: data.countryCode || '+91',
          password: data.password,
          googleId: data.googleId,
          emailVerifiedAt: data.emailVerified ? new Date() : undefined,
          mobileVerifiedAt: data.mobileVerified ? new Date() : undefined,
          avatar: data.avatar,
          status,
          source,
          heardFrom: data.heardFrom,
          referralCode: referralCode(),
          referredBy: data.referredBy,
          consents: { communication: Boolean(data.consentCommunication), terms: Boolean(data.acceptTerms), acceptedAt: new Date(), ip },
        },
      ],
      { session },
    );
    const [profile] = await Candidate.create([{ user: user._id, experienceLevel: data.experienceLevel, ...(data.profile || {}) }], { session });
    return { user, profile };
  };

  if (outerSession) return run(outerSession);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await run(session);
    });
    return result;
  } catch (err) {
    // Standalone MongoDB (no replica set) does not support transactions - fall back gracefully.
    if (err?.code === 20 || /Transaction numbers are only allowed/.test(err?.message || '')) return run(undefined);
    throw err;
  } finally {
    await session.endSession();
  }
}

/**
 * Creates an employer organization (company / consultancy) with its owner user (Employer Admin).
 */
export async function createEmployerAccount(data, { source = 'direct', ip, status } = {}) {
  const email = normalizeEmail(data.email);
  const mobile = normalizeMobile(data.mobile);
  const type = data.employerType === EMPLOYER_TYPE.CONSULTANCY ? EMPLOYER_TYPE.CONSULTANCY : EMPLOYER_TYPE.COMPANY;
  await assertNotBlocklisted({ email, mobile, name: data.organizationName, gst: data.gstNumber, url: data.website, ip });
  await assertIdentityAvailable({ email, mobile, username: data.username });
  if (data.username) validateUsername(data.username);

  const approvalRequired = await getSetting('platform.employerApprovalRequired', true);
  const orgStatus = status || (approvalRequired ? USER_STATUS.PENDING : USER_STATUS.ACTIVE);

  const run = async (session) => {
    const userId = new mongoose.Types.ObjectId();
    const uid = await generateUid(type === EMPLOYER_TYPE.CONSULTANCY ? ID_PREFIX.consultancy : ID_PREFIX.company, new Date(), session);
    const [org] = await Organization.create(
      [
        {
          uid,
          type,
          name: data.organizationName,
          legalName: data.legalName,
          slug: uniqueSlug(data.organizationName),
          email,
          phone: mobile,
          website: data.website,
          gstNumber: data.gstNumber,
          industries: data.industries,
          owner: userId,
          status: orgStatus,
          source,
          consultancyDeclaration:
            type === EMPLOYER_TYPE.CONSULTANCY || data.declarations
              ? { authorized: Boolean(data.declarations?.authorized), noCandidateFee: Boolean(data.declarations?.noCandidateFee), acceptedAt: new Date() }
              : undefined,
        },
      ],
      { session },
    );
    const [user] = await User.create(
      [
        {
          _id: userId,
          role: ROLES.EMPLOYER,
          fullName: data.fullName,
          displayName: data.displayName || data.fullName,
          username: data.username || (await generateUsername(data.fullName || data.organizationName)),
          gender: data.gender,
          email,
          mobile,
          password: data.password,
          googleId: data.googleId,
          emailVerifiedAt: data.emailVerified ? new Date() : undefined,
          status: USER_STATUS.ACTIVE,
          source,
          heardFrom: data.heardFrom,
          referralCode: referralCode(),
          consents: { communication: Boolean(data.consentCommunication), terms: Boolean(data.acceptTerms), acceptedAt: new Date(), ip },
          employer: { organization: org._id, isOwner: true, memberRole: 'employer_admin', designation: data.designation },
        },
      ],
      { session },
    );
    return { user, organization: org };
  };

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await run(session);
    });
    return result;
  } catch (err) {
    if (err?.code === 20 || /Transaction numbers are only allowed/.test(err?.message || '')) return run(undefined);
    throw err;
  } finally {
    await session.endSession();
  }
}
