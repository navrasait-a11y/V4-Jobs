/**
 * Idempotent seed: master data (Excel options + starter lists), locations, plans and CMS pages.
 * Safe to re-run - existing records are left untouched (upserts by natural key).
 *   npm run seed
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Lookup, Location } from '../src/modules/masterdata/masterdata.models.js';
import { Plan } from '../src/modules/billing/billing.models.js';
import { Page } from '../src/modules/cms/cms.models.js';
import { slugify } from '../src/shared/utils/helpers.js';
import * as starter from './data/starter.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const excel = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'lookups.json'), 'utf8'));

async function upsertLookups(type, names, parent) {
  const ops = names.map((name, i) => ({
    updateOne: {
      filter: { type, slug: slugify(name), parent: parent || null },
      update: { $setOnInsert: { type, name, slug: slugify(name), parent, order: i, isActive: true } },
      upsert: true,
    },
  }));
  if (ops.length) await Lookup.bulkWrite(ops, { ordered: false });
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

  await upsertLookups('industry', starter.industries);
  await upsertLookups('department', Object.keys(starter.departments));
  for (const [dept, roles] of Object.entries(starter.departments)) await upsertLookups('job_role', roles, await idOf('department', dept));
  for (const [level, list] of Object.entries(starter.degrees)) await upsertLookups('degree', list, await idOf('education_level', level));
  for (const [degree, list] of Object.entries(starter.specialisations)) await upsertLookups('specialisation', list, await idOf('degree', degree));
  await upsertLookups('key_skill', starter.keySkills);
  await upsertLookups('it_skill', starter.itSkills);
  await upsertLookups('job_title', [...new Set(starter.jobTitles)]);
  await upsertLookups('job_category', starter.jobCategories);
  await upsertLookups('situation_tag', starter.situationTags);
  await upsertLookups('faq_category', starter.faqCategories);
  await upsertLookups('blog_category', starter.blogCategories);

  console.log('Seeding locations...');
  for (const l of starter.locations) {
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
