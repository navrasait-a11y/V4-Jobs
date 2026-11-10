import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import logger from '../../config/logger.js';
import { Location, Lookup } from '../../modules/masterdata/masterdata.models.js';

const MAX_TEXT = 100000;

/** Extracts plain text from PDF / DOCX resumes. Legacy .doc is stored but not parsed. */
export async function extractText(file) {
  try {
    if (file.mimetype === 'application/pdf') {
      // The bundled pdf.js 2.x reads modern PDFs (Word, Canva, pdfkit) that 1.10 rejects with "bad XRef entry".
      // Small uploads share Node's buffer pool; pdf.js reads the whole underlying ArrayBuffer, so hand it a private copy.
      const data = new Uint8Array(file.buffer);
      const out = await pdfParse(data, { max: 10, version: 'v2.0.550' }).catch(() => pdfParse(new Uint8Array(file.buffer), { max: 10 }));
      return (out.text || '').slice(0, MAX_TEXT);
    }
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const out = await mammoth.extractRawText({ buffer: file.buffer });
      return (out.value || '').slice(0, MAX_TEXT);
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Resume text extraction failed');
  }
  return '';
}

const TTL = 10 * 60 * 1000;
let dict = { at: 0, keySkills: [], itSkills: [], languages: [], cities: [] };
async function dictionaries() {
  if (Date.now() - dict.at < TTL && dict.keySkills.length) return dict;
  const [rows, cities] = await Promise.all([
    Lookup.find({ type: { $in: ['key_skill', 'it_skill', 'language'] }, isActive: true })
      .select('type name')
      .limit(30000)
      .lean(),
    Location.aggregate([{ $group: { _id: '$city', state: { $first: '$state' }, country: { $first: '$country' } } }, { $limit: 20000 }]),
  ]);
  const of = (t) => rows.filter((r) => r.type === t).map((r) => r.name);
  dict = { at: Date.now(), keySkills: of('key_skill'), itSkills: of('it_skill'), languages: of('language'), cities: cities.filter((c) => c._id && c._id.length > 2) };
  return dict;
}

const escape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (needle) => new RegExp(`(^|[^a-z0-9+#.])${escape(needle.toLowerCase())}([^a-z0-9+#]|$)`, 'i');
const findAll = (lower, names, max) => {
  const out = [];
  for (const n of names) {
    if (!n || n.length < 2) continue;
    if (wordRe(n).test(lower)) out.push(n);
    if (out.length >= max) break;
  }
  return out;
};

const HEADINGS = /^(profile|professional\s+summary|summary|career\s+objective|objective|about\s+me|experience|work\s+experience|employment|education|skills|technical\s+skills|projects|certifications?|languages|hobbies|personal\s+details|achievements)\s*:?\s*$/i;

/** Text under the first summary / objective heading, up to the next heading. */
function sectionAfter(lines, re) {
  const i = lines.findIndex((l) => re.test(l.trim()));
  if (i < 0) return '';
  const out = [];
  for (const l of lines.slice(i + 1)) {
    if (HEADINGS.test(l.trim())) break;
    if (l.trim()) out.push(l.trim());
    if (out.join(' ').length > 1200) break;
  }
  return out.join(' ').replace(/\s+/g, ' ').slice(0, 1000);
}

/** First line that looks like a person's name (2-4 words, letters only, not a heading). */
function guessName(lines) {
  for (const raw of lines.slice(0, 8)) {
    const l = raw.trim();
    if (!l || l.length > 40 || HEADINGS.test(l) || /resume|curriculum|vitae|@|\d/i.test(l)) continue;
    const words = l.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Za-z.'-]+$/.test(w))) {
      return words.map((w) => (w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w)).join(' ');
    }
  }
  return undefined;
}

/** Total experience as { years, months } from "3.5 years", "2 years 4 months", "5+ yrs of experience". */
function experience(lower) {
  const ym = lower.match(/(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:and\s*)?(\d{1,2})\s*(?:months?|mos?)/);
  if (ym) return { years: Number(ym[1]), months: Math.min(11, Number(ym[2])) };
  const y = lower.match(/(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:total\s+|work\s+|professional\s+|industry\s+)?experience/) || lower.match(/experience\s*(?:of|:)?\s*(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)/);
  if (y) {
    const v = Number(y[1]);
    return { years: Math.floor(v), months: Math.round((v % 1) * 12) };
  }
  const m = lower.match(/(\d{1,2})\s*months?\s+(?:of\s+)?experience/);
  return m ? { years: 0, months: Math.min(11, Number(m[1])) } : undefined;
}

/**
 * Resume parser: name, contact, links, total experience, summary, key / IT skills, languages and city,
 * matched against the master data. Results are suggestions only - the candidate picks what to apply.
 */
export async function parseResume(text) {
  if (!text) return {};
  const lower = text.toLowerCase();
  const lines = text.split(/\r?\n/);
  const { keySkills, itSkills, languages, cities } = await dictionaries();
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  const phone = text
    .match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/)?.[0]
    ?.replace(/\D/g, '')
    .slice(-10);
  const links = [...new Set(text.match(/https?:\/\/[^\s)]+|(?:www\.)?(?:linkedin\.com|github\.com)\/[^\s)]+/gi) || [])].map((l) => (/^https?:/i.test(l) ? l : `https://${l}`)).slice(0, 10);
  const head = lower.slice(0, 2500);
  const city = cities.find((c) => wordRe(c._id).test(head));
  const exp = experience(lower);
  // Match skills on the text without links, so "github.com/name" does not become the skill GitHub.
  const body = lower.replace(/https?:\/\/\S+|(?:www\.)?[a-z0-9-]+\.(?:com|in|io|org|net|dev)\/\S*/g, ' ');
  const it = findAll(body, itSkills, 15);
  const langs = findAll(body, languages, 10);
  const langSet = new Set(langs.map((l) => l.toLowerCase()));
  const skills = findAll(body, keySkills, 40).filter((k) => !it.includes(k) && !langSet.has(k.toLowerCase()));

  return {
    fullName: guessName(lines),
    email,
    mobile: phone,
    links,
    totalExperience: exp,
    totalExperienceYears: exp ? exp.years + exp.months / 12 : undefined,
    profileSummary: sectionAfter(lines, /^(professional\s+summary|summary|career\s+objective|objective|profile|about\s+me)\s*:?\s*$/i) || undefined,
    skills,
    itSkills: it,
    languages: langs,
    currentLocation: city ? { city: city._id, state: city.state || '', country: city.country || 'India' } : undefined,
    linkedin: links.find((l) => /linkedin\.com/i.test(l)),
    github: links.find((l) => /github\.com/i.test(l)),
  };
}
