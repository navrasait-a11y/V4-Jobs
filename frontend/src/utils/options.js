/**
 * Fixed option lists from the "Other Forms" Excel (20-Oct-2026). Text lists that admins edit live in
 * master data (useLookups); these are the numeric ranges and the values the API validates against.
 */

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** "Duration of Experience": Fresher, 1-11 Months, 1-49 Years, 50 Years Plus. Value = months (string). */
export const EXPERIENCE_OPTIONS = [
  { value: '0', label: 'Fresher' },
  ...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: plural(i + 1, 'Month') })),
  ...Array.from({ length: 49 }, (_, i) => ({ value: String((i + 1) * 12), label: plural(i + 1, 'Year') })),
  { value: '600', label: '50 Years Plus' },
];
export const monthsToYears = (months) => (months === '' || months === undefined || months === null ? undefined : Math.round((Number(months) / 12) * 10000) / 10000);
export const yearsToMonths = (years) => (years === '' || years === undefined || years === null ? '' : String(Math.round(Number(years) * 12)));

/** "Experience Level" with the apply-form wording. */
export const EXPERIENCE_LEVEL_LABELS = {
  Experienced: 'I am Experienced',
  Fresher: 'I am Fresher',
  Internship: 'I did an Internship',
  Apprenticeship: 'I did an Apprenticeship',
};

/** Age 18 to 60, then "60+ Years" (61 = no upper limit). */
export const AGE_OPTIONS = [...Array.from({ length: 43 }, (_, i) => ({ value: String(18 + i), label: `${18 + i} Years` })), { value: '61', label: '60+ Years' }];

export const DISTANCE_OPTIONS = [5, 10, 15, 20, 25, 35, 50, 75, 100, 150, 200].map((n) => ({ value: String(n), label: `${n} KM` }));

export const DATE_POSTED_OPTIONS = [1, 2, 4, 7, 10, 15].map((n) => ({ value: String(n), label: plural(n, 'Day') }));

export const LAST_ACTIVE_OPTIONS = [
  ...[1, 2, 4, 7, 10, 15, 30, 60, 90, 180].map((n) => ({ value: String(n), label: plural(n, 'Day') })),
  { value: '365', label: '1 Year' },
  { value: '365+', label: '1 Year Plus' },
];

/** Internship Period: 1-11 Months or No Fixed Duration. */
export const INTERNSHIP_PERIOD_OPTIONS = [...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: plural(i + 1, 'Month') })), { value: 'none', label: 'No Fixed Duration' }];

export const STIPEND_OPTIONS = [
  { value: 'Paid', label: 'Paid' },
  { value: 'Unpaid', label: 'Unpaid' },
];

export const EMPLOYER_TYPE_OPTIONS = [
  { value: 'company', label: 'Company' },
  { value: 'consultancy', label: 'Consultancy' },
];

export const QUESTION_TYPE_OPTIONS = [
  { value: 'single_choice', label: 'Single Choice' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'short_answer', label: 'Short Answer' },
  { value: 'text', label: 'Answer In Text Only' },
  { value: 'number', label: 'Answer In Numbers Only' },
];
export const CHOICE_TYPES = ['single_choice', 'multiple_choice', 'choice'];

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const JOB_SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevant' },
  { value: 'salary', label: 'Salary - High to Low' },
  { value: 'salary_asc', label: 'Salary - Low to High' },
  { value: 'date', label: 'Dateposted - New to Old' },
];

export const COMPANY_SCOPE_OPTIONS = [
  { value: 'current', label: 'Current Company' },
  { value: 'previous', label: 'Previous Company' },
  { value: 'exclude', label: 'Exclude Company' },
  { value: 'both', label: 'Current/Previous Company' },
];

export const CANDIDATE_TYPE_OPTIONS = [
  { value: 'new', label: 'Newly Registered' },
  { value: 'modified', label: 'Recently Modified' },
  { value: 'active', label: 'Actively Applying' },
  { value: 'trending', label: 'Trending Profile' },
  { value: 'featured', label: 'Featured Candidate' },
  { value: 'premium', label: 'Premium Candidate' },
];

export const CANDIDATES_WITH_OPTIONS = [
  { value: 'verified_mobile', label: 'Verified Mobile Number' },
  { value: 'whatsapp', label: 'Available On WhatsApp' },
  { value: 'verified_email', label: 'Verified Email ID' },
  { value: 'resume', label: 'Attached Resume' },
];

export const HIDE_CANDIDATE_OPTIONS = [
  { value: 'unlocked', label: 'Already Unlocked' },
  { value: 'viewed', label: 'Already Viewed' },
  { value: 'downloaded', label: 'Already Downloaded In Excel' },
  { value: 'invited', label: 'Already Invited' },
  { value: 'invited_whatsapp', label: 'Already Invited By WhatsApp' },
];

/** Excel "Mode of Interview" values that show Call Now; the rest show Request Call Back. */
export const CALL_NOW_MODES = ['Walk-in', 'Candidates Can Call Me Directly', 'Candidates Can Call Other Recruiter'];

export const wordCount = (text = '') => (String(text).trim() ? String(text).trim().split(/\s+/).length : 0);
