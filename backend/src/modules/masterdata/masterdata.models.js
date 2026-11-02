import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Every dropdown / suggestion list in the Excel forms that says "Edit / Add New Option Required
 * in Admin Panel" is a Lookup type. Hierarchies use `parent`: Industry > Sub Industry,
 * Department > Function, Education level > Degree > Specialisation. Job roles are one flat list.
 */
export const LOOKUP_TYPES = Object.freeze({
  experience_level: 'Experience Level',
  journey_status: 'Current Job Journey Status',
  present_job_status: 'Present Job Status',
  heard_from: 'From Where You Heard About Us',
  gender: 'Gender',
  marital_status: 'Marital Status',
  guardian_relation: 'Guardian Relation',
  caste_category: 'Category',
  disability_status: 'Disability Status',
  disability_type: 'Disability / Differently-abled Type',
  military_status: 'Military Experience',
  service_type: 'Service Type',
  english_fluency: 'English Fluency Level',
  language: 'Language',
  asset: 'Assets Availability',
  candidate_document: 'Documents Availability',
  relocate_option: 'Ready To Relocate',
  diversity_hiring: 'Diversity Hiring',
  interview_mode: 'Mode of Interview',
  internship_type: 'Internship Type',
  top_company: 'Top Companies (job and company filters)',
  candidate_stage: 'Candidate Status / Interview Stage',
  job_title: 'Job Title / Designation',
  key_skill: 'Key Skill',
  it_skill: 'IT Skill',
  company_name: 'Company Name',
  employer_type: 'Employer / Company Type',
  employment_type: 'Employment Type',
  job_mode: 'Job Mode Type',
  shift: 'Job Shift Type',
  salary_type: 'Salary Type',
  perk: 'Additional Perks',
  notice_period: 'Notice Period / Availability to Join',
  industry: 'Industry / Sector',
  sub_industry: 'Sub Industry',
  department: 'Department',
  department_function: 'Department Function',
  job_role: 'Job Role',
  education_level: 'Level of Education',
  degree: 'Degree / Course',
  specialisation: 'Specialisation',
  institution: 'Institution / College',
  education_status: 'Education Status',
  education_type: 'Education Type',
  education_medium: 'Education Medium',
  marks_type: 'Marks Type',
  certification: 'Certification Course',
  social_platform: 'Online Social Profile',
  hiring_status: 'Current Hiring Status',
  hiring_authority: 'Hiring Authority Type',
  organization_type: 'Organization Type',
  company_size: 'Total Employees Count',
  office_type: 'Office Address Type',
  document_type: 'Verification Document',
  situation_tag: 'User Situation Tag',
  faq_category: 'FAQ Category',
  blog_category: 'Blog Category',
  job_category: 'Job Category (IT / Non IT ...)',
});

/** Child type -> parent type, for the "pick a parent, then its sub options" fields. */
export const PARENT_TYPE = Object.freeze({ sub_industry: 'industry', department_function: 'department', degree: 'education_level', specialisation: 'degree' });

/** Types where front-end users may add a new option (Excel: "Enable Add New Options For Admin & User Both"). */
export const USER_ADDABLE_TYPES = ['job_title', 'key_skill', 'it_skill', 'institution', 'company_name', 'certification'];

const lookupSchema = new Schema(
  {
    type: { type: String, enum: Object.keys(LOOKUP_TYPES), required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Lookup' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isUserAdded: { type: Boolean, default: false },
    usageCount: { type: Number, default: 0 },
    meta: Schema.Types.Mixed,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
lookupSchema.index({ type: 1, slug: 1, parent: 1 }, { unique: true });
lookupSchema.index({ type: 1, isActive: 1, order: 1, name: 1 });
lookupSchema.index({ type: 1, usageCount: -1 });

/** Location master - format: District, City, State, Country (e.g. Loni, Ghaziabad, Uttar Pradesh, India). */
const locationSchema = new Schema(
  {
    locality: { type: String, trim: true },
    district: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    country: { type: String, default: 'India', trim: true },
    pincode: String,
    displayName: { type: String, required: true },
    searchKey: { type: String, required: true, index: true }, // lower-cased display name for prefix search
    isPopular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    geo: { lat: Number, lng: Number },
  },
  { timestamps: true },
);
locationSchema.index({ country: 1, state: 1, city: 1, district: 1, locality: 1 }, { unique: true });
locationSchema.index({ city: 1 });

export const Lookup = mongoose.models.Lookup || mongoose.model('Lookup', lookupSchema);
export const Location = mongoose.models.Location || mongoose.model('Location', locationSchema);
