import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import logger from '../../config/logger.js';
import { Lookup } from '../../modules/masterdata/masterdata.models.js';

const MAX_TEXT = 100000;

/** Extracts plain text from PDF / DOCX resumes. Legacy .doc is stored but not parsed. */
export async function extractText(file) {
  try {
    if (file.mimetype === 'application/pdf') {
      const out = await pdfParse(file.buffer, { max: 10 });
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

let skillCache = { at: 0, skills: [] };
async function knownSkills() {
  if (Date.now() - skillCache.at < 10 * 60 * 1000) return skillCache.skills;
  const rows = await Lookup.find({ type: { $in: ['key_skill', 'it_skill'] }, isActive: true })
    .select('name')
    .limit(20000)
    .lean();
  skillCache = { at: Date.now(), skills: rows.map((r) => r.name) };
  return skillCache.skills;
}

/**
 * Lightweight resume parser: pulls e-mail, phone, links, total experience hints and skills that
 * match the master skill list. Results are returned as suggestions - nothing is overwritten.
 */
export async function parseResume(text) {
  if (!text) return {};
  const lower = text.toLowerCase();
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  const phone = text
    .match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/)?.[0]
    ?.replace(/\D/g, '')
    .slice(-10);
  const links = [...new Set(text.match(/https?:\/\/[^\s)]+/g) || [])].slice(0, 10);
  const expMatch = lower.match(/(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience/);

  const skills = [];
  for (const s of await knownSkills()) {
    const needle = s.toLowerCase();
    if (needle.length < 2) continue;
    const re = new RegExp(`(^|[^a-z0-9+#.])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9+#]|$)`, 'i');
    if (re.test(lower)) skills.push(s);
    if (skills.length >= 40) break;
  }

  return {
    email,
    mobile: phone,
    links,
    totalExperienceYears: expMatch ? Number(expMatch[1]) : undefined,
    skills,
    linkedin: links.find((l) => l.includes('linkedin.com')),
    github: links.find((l) => l.includes('github.com')),
  };
}
