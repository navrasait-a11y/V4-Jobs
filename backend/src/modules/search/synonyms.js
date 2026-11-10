/**
 * Short forms Indian job seekers and recruiters type, mapped to the words used in job posts.
 * Used to widen keyword search ("sde" finds "Software Developer") and to suggest the full form.
 */
export const SYNONYMS = {
  sde: ['software developer', 'software engineer'],
  swe: ['software engineer'],
  dev: ['developer'],
  fe: ['frontend developer'],
  be: ['backend developer'],
  'full stack': ['full stack developer'],
  fullstack: ['full stack developer'],
  qa: ['quality assurance', 'qa engineer', 'tester'],
  sqa: ['software tester', 'qa engineer'],
  hr: ['human resources', 'hr executive', 'hr recruiter'],
  ta: ['talent acquisition'],
  ca: ['chartered accountant'],
  cs: ['company secretary'],
  cma: ['cost accountant'],
  bpo: ['customer support', 'call centre'],
  kpo: ['knowledge process outsourcing'],
  pm: ['product manager', 'project manager'],
  ba: ['business analyst'],
  bd: ['business development'],
  bde: ['business development executive'],
  mr: ['medical representative'],
  rm: ['relationship manager'],
  ui: ['ui designer'],
  ux: ['ux designer'],
  'ui/ux': ['ui ux designer'],
  ml: ['machine learning'],
  ai: ['artificial intelligence', 'machine learning'],
  dba: ['database administrator'],
  seo: ['search engine optimization', 'digital marketing'],
  smm: ['social media marketing'],
  'tele caller': ['telecaller'],
  telecalling: ['telecaller'],
  'data entry': ['data entry operator'],
  deo: ['data entry operator'],
  accounts: ['accountant'],
  driver: ['driver', 'delivery executive'],
  'delivery boy': ['delivery executive', 'delivery partner'],
  receptionist: ['front office executive', 'receptionist'],
  'back office': ['back office executive'],
};

/** Full forms for a typed word, or [] when it is not a known short form. */
export const expandTerm = (term) =>
  SYNONYMS[
    String(term || '')
      .trim()
      .toLowerCase()
  ] || [];
