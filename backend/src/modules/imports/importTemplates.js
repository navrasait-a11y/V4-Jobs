import ExcelJS from 'exceljs';
import ApiError from '../../shared/errors/ApiError.js';
import { buildCsv } from '../../shared/utils/excel.js';
import { Lookup, LOOKUP_TYPES, PARENT_TYPE } from '../masterdata/masterdata.models.js';

/**
 * One description per import: the columns its parser reads, which are required, what to type and
 * a couple of sample rows. The same spec drives the downloadable sample (.xlsx / .csv) and the
 * format guide shown in the import dialog, so the guide, the sample and the parser cannot drift
 * apart (tests import every sample to prove it).
 *
 * Column fields: header (exactly what the parser matches), required (true | 'either'), hint,
 * values (allowed values; becomes a drop-down in the .xlsx), text (keep as text, e.g. mobile),
 * examples (one value per sample row).
 */

const YES_NO = ['Yes', 'No'];

const SPECS = {
  candidates: {
    title: 'Candidates',
    filename: 'freejobwala-candidates-sample',
    sheet: 'Candidates',
    maxRows: 20000,
    intro: 'One row per candidate. Accounts are created without a password; candidates sign in with an OTP on their mobile or e-mail.',
    columns: [
      { header: 'Full Name', required: true, hint: 'Candidate’s full name', examples: ['Asha Verma', 'Rohit Kumar'] },
      { header: 'Email ID', required: 'either', hint: 'E-mail ID or Mobile Number is required. Used to find duplicates', examples: ['asha.verma@example.com', 'rohit.kumar@example.com'] },
      { header: 'Mobile Number', required: 'either', text: true, hint: '10-digit Indian mobile number, without +91 or 0', examples: ['9876500001', '9876500002'] },
      { header: 'Gender', values: ['Male', 'Female', 'Transgender', 'Other'], examples: ['Female', 'Male'] },
      { header: 'Experience Level', values: ['Experienced', 'Fresher', 'Internship', 'Apprenticeship'], examples: ['Experienced', 'Fresher'] },
      { header: 'Current Job Title', hint: 'Leave blank for freshers', examples: ['Sales Executive', ''] },
      { header: 'Key Skills', hint: 'Up to 15 skills, separated by commas', examples: ['Field Sales, B2B Sales, MS Excel', 'Data Entry, Typing'] },
      { header: 'Current City', examples: ['Indore', 'Patna'] },
      { header: 'State', examples: ['Madhya Pradesh', 'Bihar'] },
      { header: 'Total Experience (Months)', hint: 'Whole number of months, e.g. 2 years = 24', examples: ['36', '0'] },
      { header: 'Current Salary', hint: 'Yearly salary in ₹, numbers only', examples: ['300000', ''] },
      { header: 'Level of Education', hint: 'Highest education, e.g. 10th Pass, 12th Pass, ITI, Diploma, Graduate, Post Graduate', examples: ['Graduate', '12th Pass'] },
      { header: 'Degree', hint: 'Degree of the highest education', examples: ['B.Com', ''] },
    ],
    notes: ['Choose “Add new only”, “Add new and update” or “Delete previous imported data, then add” after picking the file, and use “Check duplicates” before importing.'],
  },

  employers: {
    title: 'Employers',
    filename: 'freejobwala-employers-sample',
    sheet: 'Employers',
    maxRows: 5000,
    intro: 'One row per company or consultancy. Each row creates an active employer account with the free plan; rows whose e-mail or mobile already exists are skipped.',
    columns: [
      { header: 'Employer Type', values: ['Company', 'Consultancy'], hint: 'Blank means Company', examples: ['Company', 'Consultancy'] },
      { header: 'Company Name', required: true, hint: 'Company or consultancy name', examples: ['Sunrise Textiles Pvt Ltd', 'Bright Path Placements'] },
      { header: 'Full Name', hint: 'Account owner’s name. Blank uses the company name', examples: ['Neha Sharma', 'Vikas Gupta'] },
      { header: 'Official Email ID', required: true, hint: 'The owner signs in with this e-mail', examples: ['hr@sunrise-textiles.example.com', 'contact@brightpath.example.com'] },
      { header: 'Mobile Number', text: true, hint: '10-digit Indian mobile number', examples: ['9876500101', '9876500102'] },
      { header: 'Website', examples: ['https://www.example.com', ''] },
      { header: 'GST Number', text: true, hint: '15-character GSTIN', examples: ['27AAPFU0939F1ZV', ''] },
      { header: 'Industry', examples: ['Textiles & Apparel', 'Recruitment / Staffing'] },
      { header: 'City', hint: 'Head office city', examples: ['Surat', 'Lucknow'] },
      { header: 'State', examples: ['Gujarat', 'Uttar Pradesh'] },
    ],
    notes: [],
  },

  jobs: {
    title: 'Jobs',
    filename: 'freejobwala-jobs-sample',
    sheet: 'Jobs',
    maxRows: 500,
    intro: 'One row per job or internship. Jobs are saved as drafts unless you choose to publish them right away.',
    columns: [
      { header: 'Job Title', required: true, examples: ['Sales Executive', 'Graphic Design Intern'] },
      { header: 'Job or Internship', values: ['Job', 'Internship'], hint: 'Blank means Job', examples: ['Job', 'Internship'] },
      { header: 'Description', hint: 'Responsibilities and requirements. Blank uses the job title', examples: ['Visit retail outlets, generate orders and maintain client relationships.', 'Design social media posts and banners for our brands.'] },
      { header: 'Key Skills', hint: 'Separated by commas', examples: ['Field Sales, Negotiation, MS Excel', 'Photoshop, Canva, Illustrator'] },
      { header: 'City', required: true, examples: ['Indore', 'Pune'] },
      { header: 'State', examples: ['Madhya Pradesh', 'Maharashtra'] },
      { header: 'Min Experience', hint: 'In years, numbers only (0 for freshers)', examples: ['1', '0'] },
      { header: 'Max Experience', hint: 'In years, numbers only', examples: ['4', ''] },
      { header: 'Min Salary', hint: 'Monthly salary in ₹, numbers only', examples: ['18000', '8000'] },
      { header: 'Max Salary', hint: 'Monthly salary in ₹, numbers only', examples: ['30000', '12000'] },
      { header: 'Openings', hint: 'Number of vacancies. Blank means 1', examples: ['5', '2'] },
      { header: 'Employment Type', hint: 'e.g. Full Time, Permanent. Separate several with ;', examples: ['Full Time, Permanent', 'Full Time, Internship'] },
      { header: 'Work Mode', values: ['Work From Office', 'Work From Home', 'Work From Field', 'Hybrid', 'Remote', 'Any'], hint: 'Separate several with commas', examples: ['Work From Field', 'Hybrid'] },
      { header: 'Industry', examples: ['FMCG', 'Advertising & Marketing'] },
      { header: 'Department', examples: ['Sales & Business Development', 'Marketing & Communication'] },
      { header: 'Role', examples: ['Field Sales Executive', 'Graphic Designer'] },
      { header: 'Client Name', hint: 'Consultancies only: the client you are hiring for (kept hidden from candidates)', examples: ['', ''] },
    ],
    notes: ['Employment types contain a comma themselves (“Full Time, Permanent”) and are read correctly as they are.'],
  },

  'job-alerts': {
    title: 'Job alerts',
    filename: 'freejobwala-job-alerts-sample',
    sheet: 'Job alerts',
    maxRows: 10000,
    intro: 'One row per alert. The candidate must already be registered; they are matched by e-mail or mobile.',
    columns: [
      { header: 'Alert Name', hint: 'Blank means “Job alert”', examples: ['Sales jobs in Indore', 'Data entry jobs'] },
      { header: 'Email ID', required: 'either', hint: 'E-mail ID or Mobile Number of a registered candidate', examples: ['asha.verma@example.com', 'rohit.kumar@example.com'] },
      { header: 'Mobile Number', required: 'either', text: true, examples: ['9876500001', '9876500002'] },
      { header: 'Key Skills', hint: 'Up to 15, separated by commas', examples: ['Field Sales, B2B Sales', 'Data Entry'] },
      { header: 'Job Title', examples: ['Sales Executive', 'Data Entry Operator'] },
      { header: 'Locations', hint: 'Up to 3 cities, separated by commas', examples: ['Indore, Bhopal', 'Patna'] },
      { header: 'Frequency', values: ['daily', 'weekly', 'monthly'], hint: 'Blank means daily', examples: ['daily', 'weekly'] },
    ],
    notes: ['Import the candidates first if they are not on the platform yet.'],
  },

  locations: {
    title: 'Locations',
    filename: 'freejobwala-locations-sample',
    sheet: 'Locations',
    maxRows: 50000,
    intro: 'One row per place. A row with the same country, state, city, district and locality updates the existing place.',
    columns: [
      { header: 'Locality', hint: 'Area or neighbourhood (optional)', examples: ['Vijay Nagar', ''] },
      { header: 'District', examples: ['Indore', 'Surat'] },
      { header: 'City', required: true, examples: ['Indore', 'Surat'] },
      { header: 'State', required: true, examples: ['Madhya Pradesh', 'Gujarat'] },
      { header: 'Country', hint: 'Blank means India', examples: ['India', 'India'] },
      { header: 'Pincode', text: true, hint: '6 digits', examples: ['452010', ''] },
      { header: 'Popular', values: YES_NO, hint: 'Yes shows it among the popular locations', examples: ['Yes', 'No'] },
    ],
    notes: [],
  },
};

export const TEMPLATE_KINDS = [...Object.keys(SPECS), 'master-data'];

/** Master data: the columns depend on the list; the sample rows are real entries, so importing them changes nothing. */
async function masterDataSpec(type) {
  if (!LOOKUP_TYPES[type]) throw ApiError.badRequest('Choose a master data list');
  const label = LOOKUP_TYPES[type];
  const parentType = PARENT_TYPE[type];
  const items = await Lookup.find({ type, isActive: { $ne: false } })
    .sort({ usageCount: -1, order: 1, name: 1 })
    .limit(3)
    .populate({ path: 'parent', select: 'name parent', populate: { path: 'parent', select: 'name' } })
    .lean();
  const parentName = (o) => (o.parent ? (type === 'specialisation' && o.parent.parent?.name ? `${o.parent.parent.name} > ${o.parent.name}` : o.parent.name) : '');
  let examples = items.map((o) => ({ name: o.name, parent: parentName(o), order: String(o.order || 0), active: o.isActive === false ? 'No' : 'Yes' }));
  if (!examples.length) {
    const parents = parentType ? await Lookup.find({ type: parentType }).sort({ order: 1, name: 1 }).limit(2).select('name').lean() : [];
    examples = [1, 2].map((n, i) => ({ name: `New ${label} ${n}`, parent: parents[i]?.name || parents[0]?.name || '', order: String(n), active: 'Yes' }));
  }
  const parentLabel = parentType ? LOOKUP_TYPES[parentType] : '';
  const columns = [
    { header: 'Name', required: true, hint: `The option as it appears in the ${label} drop-down`, examples: examples.map((e) => e.name) },
    ...(parentType
      ? [
          {
            header: 'Parent',
            required: true,
            hint:
              type === 'specialisation'
                ? `The ${parentLabel} it belongs to, written as “Education Level > Degree” (degree names repeat across levels)`
                : `The ${parentLabel} it belongs to, spelt exactly as in that list`,
            examples: examples.map((e) => e.parent),
          },
        ]
      : []),
    { header: 'Order', hint: 'Position in the list (smaller first). Blank means 0', examples: examples.map((e) => e.order) },
    { header: 'Active', values: YES_NO, hint: 'No hides the option. Blank means Yes', examples: examples.map((e) => e.active) },
  ];
  return {
    title: label,
    filename: `freejobwala-${type.replace(/_/g, '-')}-sample`,
    sheet: label.replace(/[\\/*?:[\]]/g, '-').slice(0, 31), // characters Excel forbids in sheet names
    maxRows: 10000,
    intro: `One row per option of “${label}”. A row whose name${parentType ? ' and parent' : ''} already exists updates that option instead of adding a copy.`,
    columns,
    notes: examples[0]?.name.startsWith('New ') ? [] : ['The sample rows are existing options, so importing the sample as it is changes nothing.'],
  };
}

const GENERAL_NOTES = (spec) => [
  'Keep the column headings in row 1 as they are. Columns can be in any order, and optional columns can be removed.',
  'Columns marked * are required. Rows missing them are skipped and listed with their row number after the import.',
  'Replace the sample rows with your own data (one row per record) before importing.',
  'Where a cell takes several values, separate them with commas. If a value itself contains a comma, separate the values with ; instead.',
  `Upload an Excel workbook (.xlsx) or a CSV file (CSV UTF-8), up to 20 MB and ${spec.maxRows.toLocaleString('en-IN')} rows. Old .xls files must be saved as .xlsx first.`,
];

export async function getTemplateSpec(kind, { type } = {}) {
  const spec = kind === 'master-data' ? await masterDataSpec(type) : SPECS[kind];
  if (!spec) throw ApiError.notFound('Unknown import');
  const rowCount = Math.max(...spec.columns.map((c) => c.examples?.length || 0));
  return {
    kind,
    ...spec,
    columns: spec.columns.map(({ examples = [], ...c }) => ({ ...c, required: c.required || false, example: examples.find(Boolean) || '' })),
    rows: Array.from({ length: rowCount }, (_, i) => Object.fromEntries(spec.columns.map((c) => [c.header, c.examples?.[i] ?? '']))),
    notes: [...GENERAL_NOTES(spec), ...(spec.notes || [])],
    formats: ['xlsx', 'csv'],
  };
}

const headerText = (c) => (c.required === true ? `${c.header} *` : c.header);
const BRAND = 'FF1A56DB';
const REQUIRED = 'FFB42318';
const colLetter = (n) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

/** The sample workbook: the data sheet first (that is the one imported), then the instructions. */
async function buildTemplateWorkbook(spec) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Freejobwala';
  wb.created = new Date();
  const ws = wb.addWorksheet(spec.sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = spec.columns.map((c) => ({
    header: headerText(c),
    key: c.header,
    width: Math.min(45, Math.max(14, c.header.length + 6, ...spec.rows.map((r) => String(r[c.header] || '').length + 2))),
    style: c.text ? { numFmt: '@' } : {},
  }));
  spec.rows.forEach((r) => ws.addRow(r));
  const head = ws.getRow(1);
  head.height = 22;
  spec.columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required === true ? REQUIRED : BRAND } };
    cell.alignment = { vertical: 'middle' };
    const note = [c.required === true ? 'Required.' : c.required === 'either' ? 'Required: this or the other contact column.' : 'Optional.', c.hint, c.values ? `Allowed: ${c.values.join(', ')}` : '']
      .filter(Boolean)
      .join(' ');
    cell.note = note;
    const letter = colLetter(i + 1);
    if (c.values) {
      ws.dataValidations.add(`${letter}2:${letter}${spec.maxRows + 1}`, {
        type: 'list',
        allowBlank: true,
        formulae: [`"${c.values.join(',')}"`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: c.header,
        error: `Use one of: ${c.values.join(', ')}`,
      });
    }
  });

  const info = wb.addWorksheet('Instructions');
  info.columns = [
    { key: 'a', width: 28 },
    { key: 'b', width: 12 },
    { key: 'c', width: 70 },
    { key: 'd', width: 34 },
  ];
  info.addRow([`${spec.title}: import format`]).font = { bold: true, size: 14 };
  info.addRow([spec.intro]);
  info.mergeCells(`A2:D2`);
  info.getRow(2).alignment = { wrapText: true, vertical: 'top' };
  info.getRow(2).height = 32;
  info.addRow([]);
  const th = info.addRow(['Column', 'Required', 'What to enter', 'Example']);
  th.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  });
  for (const c of spec.columns) {
    const row = info.addRow([
      c.header,
      c.required === true ? 'Yes' : c.required === 'either' ? 'One of' : 'No',
      [c.hint, c.values ? `Allowed: ${c.values.join(', ')}` : ''].filter(Boolean).join('. '),
      c.example,
    ]);
    row.alignment = { wrapText: true, vertical: 'top' };
    if (c.required === true) row.getCell(2).font = { bold: true, color: { argb: REQUIRED } };
  }
  info.addRow([]);
  info.addRow(['Good to know']).font = { bold: true };
  for (const n of spec.notes) {
    const row = info.addRow([`• ${n}`]);
    info.mergeCells(`A${row.number}:D${row.number}`);
    row.alignment = { wrapText: true, vertical: 'top' };
    row.height = 30;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Returns { buffer, filename, type } for format xlsx | csv. */
export async function buildTemplateFile(kind, { format = 'xlsx', type } = {}) {
  const spec = await getTemplateSpec(kind, { type });
  if (format === 'csv') {
    const columns = spec.columns.map((c) => ({ header: headerText(c), key: c.header, get: (r) => r[c.header] }));
    return { buffer: buildCsv(columns, spec.rows), filename: `${spec.filename}.csv`, type: 'csv' };
  }
  return { buffer: await buildTemplateWorkbook(spec), filename: `${spec.filename}.xlsx`, type: 'xlsx' };
}
