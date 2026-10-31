import Joi from 'joi';
import { email, mobile, password, otp, username, objectId } from '../../shared/validators/common.js';

const consentFields = {
  consentCommunication: Joi.boolean().default(false), // "I agree to receive important updates via SMS, Email & WhatsApp"
  acceptTerms: Joi.boolean().valid(true).required().messages({ 'any.only': 'You must accept the Privacy Policy and Terms & Conditions' }),
};

const deviceFields = {
  deviceId: Joi.string().max(200),
  deviceName: Joi.string().max(200),
  fcmToken: Joi.string().max(4096),
};

export const registerCandidate = {
  body: Joi.object({
    experienceLevel: Joi.string().trim().max(60).required(), // I have Experience / I am a Fresher / Internship / Apprenticeship
    fullName: Joi.string().trim().min(2).max(120).required(),
    gender: Joi.string().trim().max(30).required(),
    email: email.required(),
    password: password.required(),
    mobile: mobile.required(),
    username,
    heardFrom: Joi.string().trim().max(120),
    referralCode: Joi.string().trim().max(20),
    ...consentFields,
    ...deviceFields,
  }),
};

export const registerEmployer = {
  body: Joi.object({
    employerType: Joi.string().valid('company', 'consultancy').required(), // "We are a"
    organizationName: Joi.string().trim().min(2).max(200).required(), // Company / Consultancy Name
    fullName: Joi.string().trim().min(2).max(120).required(),
    gender: Joi.string().trim().max(30),
    email: email.required(), // official e-mail
    password: password.required(),
    mobile: mobile.required(),
    username,
    designation: Joi.string().trim().max(120),
    heardFrom: Joi.string().trim().max(120),
    declarations: Joi.object({
      authorized: Joi.boolean().valid(true).required().messages({ 'any.only': 'Please confirm you are authorized to provide recruitment services' }),
      noCandidateFee: Joi.boolean().valid(true).required().messages({ 'any.only': 'Please agree not to charge candidates any fee' }),
    }).required(),
    ...consentFields,
    ...deviceFields,
  }),
};

export const login = {
  body: Joi.object({
    identifier: Joi.string().trim().max(254).required(), // e-mail, mobile or username
    password: Joi.string().max(128).required(),
    role: Joi.string().valid('candidate', 'employer', 'admin'),
    ...deviceFields,
  }),
};

export const sendLoginOtp = {
  body: Joi.object({ mobile, email, channel: Joi.string().valid('sms', 'whatsapp').default('sms') }).xor('mobile', 'email'),
};

export const otpLogin = {
  body: Joi.object({ mobile, email, otp: otp.required(), role: Joi.string().valid('candidate', 'employer', 'admin'), ...deviceFields }).xor('mobile', 'email'),
};

export const google = {
  body: Joi.object({
    idToken: Joi.string().required(),
    role: Joi.string().valid('candidate', 'employer').default('candidate'),
    organizationName: Joi.string().trim().max(200),
    employerType: Joi.string().valid('company', 'consultancy').default('company'),
    mobile,
    acceptTerms: Joi.boolean().default(true),
    consentCommunication: Joi.boolean().default(false),
    ...deviceFields,
  }),
};

export const twoFactorLogin = {
  body: Joi.object({ challengeToken: Joi.string().required(), code: Joi.string().trim().max(20).required(), ...deviceFields }),
};

export const refresh = { body: Joi.object({ refreshToken: Joi.string().max(200), fcmToken: Joi.string().max(4096) }) };

export const logout = { body: Joi.object({ allDevices: Joi.boolean().default(false), refreshToken: Joi.string().max(200) }) };

export const forgotPassword = { body: Joi.object({ email, mobile }).xor('email', 'mobile') };

export const resetPassword = {
  body: Joi.object({ token: Joi.string().max(200), mobile, otp, password: password.required() })
    .xor('token', 'mobile')
    .with('mobile', 'otp'),
};

export const changePassword = { body: Joi.object({ currentPassword: Joi.string().max(128).allow(''), newPassword: password.required() }) };

export const verifyEmail = { body: Joi.object({ token: Joi.string().required() }) };
export const verifyMobile = { body: Joi.object({ otp: otp.required() }) };
export const sendMobileOtp = { body: Joi.object({ channel: Joi.string().valid('sms', 'whatsapp').default('sms') }) };

export const contactChangeRequest = { body: Joi.object({ email, mobile }).xor('email', 'mobile') };
export const contactChangeConfirm = { body: Joi.object({ email, mobile, otp: otp.required() }).xor('email', 'mobile') };

export const twoFactorEnable = { body: Joi.object({ code: otp.required() }) };
export const twoFactorDisable = { body: Joi.object({ password: Joi.string().max(128).allow(''), code: Joi.string().trim().max(20).required() }) };

export const sessionParam = { params: Joi.object({ sessionId: objectId.required() }) };
export const deviceToken = { body: Joi.object({ fcmToken: Joi.string().max(4096).required() }) };

export const availability = { query: Joi.object({ username: Joi.string().max(30), email, mobile }).or('username', 'email', 'mobile') };
