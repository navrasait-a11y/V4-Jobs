/**
 * Idempotent seed: master data (Excel options + starter lists), locations, plans and CMS pages.
 * Safe to re-run - existing records are left untouched (upserts by natural key).
 *
 * Industry, department, job role, skill and education course lists come from the client's
 * "Required Fields- Industry- Education" Excel (scripts/data/catalog.json). Older built-in options
 * of those lists that the Excel replaced are switched off, never deleted, so saved profiles and
 * jobs keep their values. Options added by users or by an admin are not touched.
 * The "Other Forms" Excel split assets into Assets and Documents and renamed a notice period;
 * `migrateOtherForms()` moves saved candidate values to the new names.
 *   npm run seed
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Lookup, Location } from '../src/modules/masterdata/masterdata.models.js';
import { Plan } from '../src/modules/billing/billing.models.js';
import { Page } from '../src/modules/cms/cms.models.js';
import Candidate from '../src/modules/candidates/candidate.model.js';
import Job from '../src/modules/jobs/job.model.js';
import { slugify } from '../src/shared/utils/helpers.js';
import * as starter from './data/starter.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const excel = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'lookups.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'catalog.json'), 'utf8'));
const { cities } = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'cities.json'), 'utf8'));

async function upsertLookups(type, names, parent) {
  const ops = names.map((name, i) => ({
    updateOne: {
      filter: { type, slug: slugify(name), parent: parent || null },
      // Insert only: an option an admin edited or switched off stays as the admin left it.
      update: { $setOnInsert: { type, name, slug: slugify(name), parent, order: i, isActive: true } },
      upsert: true,
    },
  }));
  if (ops.length) await Lookup.bulkWrite(ops, { ordered: false });
}

/** Ids of every option a catalog list is made of, so the rest of that type can be switched off. */
async function idsOf(type, names, parent) {
  const rows = await Lookup.find({ type, slug: { $in: names.map(slugify) }, parent: parent || null })
    .select('_id')
    .lean();
  return rows.map((r) => r._id);
}

async function retireOthers(type, keep) {
  const { modifiedCount } = await Lookup.updateMany({ type, isUserAdded: { $ne: true }, createdBy: null, isActive: true, _id: { $nin: keep } }, { $set: { isActive: false } });
  if (modifiedCount) console.log(`  ${type}: switched off ${modifiedCount} options the Excel replaced`);
}

/** Two-level lists: industry > sub industry, department > function. */
async function seedTree(parentType, childType, tree) {
  const parents = Object.keys(tree);
  await upsertLookups(parentType, parents, null);
  const keepParents = await idsOf(parentType, parents);
  const keepChildren = [];
  for (const [name, children] of Object.entries(tree)) {
    const parentId = await idOf(parentType, name);
    await upsertLookups(childType, children, parentId);
    keepChildren.push(...(await idsOf(childType, children, parentId)));
  }
  await retireOthers(parentType, keepParents);
  await retireOthers(childType, keepChildren);
}

/** Education level > degree / course > specialisation, from the course sheets. */
async function seedCourses() {
  const keepDegrees = [];
  const keepSpecs = [];
  for (const [level, degrees] of Object.entries(catalog.degree)) {
    const levelId = await idOf('education_level', level);
    if (!levelId) throw new Error(`Education level "${level}" is missing. Run the main lookups first.`);
    await upsertLookups('degree', degrees, levelId);
    keepDegrees.push(...(await idsOf('degree', degrees, levelId)));
    for (const [degree, specs] of Object.entries(catalog.specialisation[level] || {})) {
      const degreeId = (await Lookup.findOne({ type: 'degree', slug: slugify(degree), parent: levelId }).select('_id').lean())?._id;
      await upsertLookups('specialisation', specs, degreeId);
      keepSpecs.push(...(await idsOf('specialisation', specs, degreeId)));
    }
  }
  await retireOthers('degree', keepDegrees);
  await retireOthers('specialisation', keepSpecs);
}

async function seedCatalog() {
  await seedTree('industry', 'sub_industry', catalog.industry);
  await seedTree('department', 'department_function', catalog.department);
  await upsertLookups('job_role', catalog.job_role, null);
  await retireOthers('job_role', await idsOf('job_role', catalog.job_role));
  await upsertLookups('key_skill', catalog.key_skill, null);
  await upsertLookups('it_skill', catalog.it_skill, null);
  // Job title suggestions also offer every Excel job role.
  await upsertLookups('job_title', catalog.job_role.filter((r) => r !== 'Fresher'));
  await seedCourses();
}

/** Flat lists the "Other Forms" Excel replaced: the Excel order wins and older built-in options go off. */
const REPLACED_LISTS = ['asset', 'notice_period'];
async function syncReplacedLists() {
  for (const type of REPLACED_LISTS) {
    const keep = await idsOf(type, excel[type]);
    await Lookup.bulkWrite(
      excel[type].map((name, i) => ({ updateOne: { filter: { type, slug: slugify(name), parent: null, createdBy: null }, update: { $set: { order: i, isActive: true } } } })),
    );
    await retireOthers(type, keep);
  }
}

const licenceKey = (v) => String(v).toLowerCase().replace(/licence/g, 'license').trim();
/** Candidate assets that are documents (licences) move to `documents`; "Immediate Joining" becomes "Immediate Joiner". */
async function migrateOtherForms() {
  const docs = new Map(excel.candidate_document.map((d) => [licenceKey(d), d]));
  const cursor = Candidate.find({ assets: { $exists: true, $ne: [] } }).select('assets documents').lean().cursor();
  let moved = 0;
  for await (const c of cursor) {
    const toDocs = c.assets.filter((a) => docs.has(licenceKey(a)));
    if (!toDocs.length) continue;
    const documents = [...new Set([...(c.documents || []), ...toDocs.map((a) => docs.get(licenceKey(a)))])];
    await Candidate.updateOne({ _id: c._id }, { $set: { assets: c.assets.filter((a) => !toDocs.includes(a)), documents } });
    moved += 1;
  }
  if (moved) console.log(`  moved licences from assets to documents on ${moved} profiles`);
  const from = 'Immediate Joining';
  const to = 'Immediate Joiner';
  await Candidate.updateMany({ noticePeriod: from }, { $set: { noticePeriod: to } });
  await Candidate.updateMany({ 'preferences.noticePeriod': from }, { $set: { 'preferences.noticePeriod': to } });
  await Candidate.updateMany({ 'employments.noticePeriod': from }, { $set: { 'employments.$[e].noticePeriod': to } }, { arrayFilters: [{ 'e.noticePeriod': from }] });
  await Job.updateMany({ noticePeriods: from }, { $set: { 'noticePeriods.$[n]': to } }, { arrayFilters: [{ n: from }] });
}

async function idOf(type, name) {
  return (
    await Lookup.findOne({ type, slug: slugify(name) })
      .select('_id')
      .lean()
  )?._id;
}

async function main() {
  await connectDatabase();
  console.log('Seeding master data...');
  for (const [type, names] of Object.entries(excel)) await upsertLookups(type, names);
  await syncReplacedLists();
  await migrateOtherForms();

  console.log('Seeding industry, department, role, skill and course lists...');
  await seedCatalog();
  await upsertLookups('key_skill', starter.keySkills);
  await upsertLookups('it_skill', starter.itSkills);
  await upsertLookups('job_title', [...new Set(starter.jobTitles)]);
  await upsertLookups('job_category', starter.jobCategories);
  await upsertLookups('situation_tag', starter.situationTags);
  await upsertLookups('faq_category', starter.faqCategories);
  await upsertLookups('blog_category', starter.blogCategories);

  console.log('Seeding locations...');
  const cityRows = cities.map(([city, state, lat, lng, popular]) => ({ city, state, isPopular: Boolean(popular), geo: { lat, lng } }));
  for (const l of [...starter.locations, ...cityRows]) {
    const doc = { country: 'India', ...l };
    doc.displayName = [doc.locality, doc.district, doc.city, doc.state, doc.country]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(', ');
    doc.searchKey = doc.displayName.toLowerCase();
    await Location.updateOne(
      { country: doc.country, state: doc.state, city: doc.city, district: doc.district ?? null, locality: doc.locality ?? null },
      { $setOnInsert: doc },
      { upsert: true },
    );
  }
  // City centre coordinates power the "within N km" filters; localities without their own geo use the city's.
  await Location.bulkWrite(
    cityRows.map((c) => ({ updateMany: { filter: { city: c.city, state: c.state, 'geo.lat': null }, update: { $set: { geo: c.geo } } } })),
  );

  console.log('Seeding plans...');
  for (const p of starter.plans) await Plan.updateOne({ code: p.code }, { $setOnInsert: p }, { upsert: true });

  console.log('Seeding CMS pages...');
  for (const p of starter.pages)
    await Page.updateOne(
      { slug: p.slug },
      { $setOnInsert: { ...p, content: `<p>${p.title} content - edit from the admin panel.</p>`, status: 'published' } },
      { upsert: true },
    );

  console.log(`Done. Lookups: ${await Lookup.countDocuments()}, Locations: ${await Location.countDocuments()}, Plans: ${await Plan.countDocuments()}`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
