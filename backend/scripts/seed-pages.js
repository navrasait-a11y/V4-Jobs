/**
 * Replaces placeholder CMS pages with starter copy. Pages already edited by an admin are left alone.
 * Legal pages are drafts: have them reviewed before launch.
 *   npm run seed:pages
 */
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Page } from '../src/modules/cms/cms.models.js';

const section = (title, body) => `<h2>${title}</h2><p>${body}</p>`;

const PAGES = {
  'about-us': `<p>Freejobwala is a job portal that connects jobseekers with employers across India. Candidates can search and apply for jobs for free, track every application, and get discovered by recruiters.</p>
${section('For jobseekers', 'Create a profile, upload your resume, set job alerts, and follow the employers you like.')}
${section('For employers', 'Post jobs, search candidates, manage applications in one pipeline, and hire with your team.')}
${section('Our promise', 'Jobs on Freejobwala are free to apply for. We never ask candidates to pay for a job, and we review employers to keep the platform safe.')}`,
  'contact-us': `<p>We are happy to help. Use the contact form in our <a href="/help-center#contact">Help Centre</a> and our team will get back to you.</p>`,
  'help-center': `<p>Find answers to common questions in our <a href="/help-center">Help Centre</a>.</p>`,
  'privacy-policy': `<p>This policy explains how Freejobwala collects and uses your information.</p>
${section('Information we collect', 'Account details such as your name, e-mail and mobile number, profile and resume details you provide, your applications and activity, and device information needed to keep your account secure.')}
${section('How we use it', 'To run your account, show relevant jobs, share your profile with employers as described below, send important updates, process payments, and prevent fraud.')}
${section('What employers see', 'Employers see the details you submit when you apply. If your profile is visible, recruiters can find it in search, and your contact details are shown only after they unlock them. You can change your visibility in Settings.')}
${section('Sharing', 'We do not sell your personal information. We share it with service providers that help us run the platform, such as e-mail, SMS, payment and hosting providers, and where the law requires it.')}
${section('Your choices', 'You can edit your profile, change notification preferences, change your visibility, deactivate your account or request deletion from Settings.')}
${section('Security and retention', 'We use encryption and access controls to protect your data, and we keep it only as long as needed for these purposes or as required by law.')}
${section('Contact', 'For privacy questions, reach us through the Help Centre.')}`,
  'terms-and-conditions': `<p>By using Freejobwala you agree to these terms.</p>
${section('Your account', 'You must give accurate information and keep your password safe. You are responsible for activity on your account.')}
${section('Acceptable use', 'Do not post false, misleading, abusive or illegal content, misuse other users\' data, or try to disrupt the platform.')}
${section('Jobs and employers', 'Employers are responsible for their job listings. Freejobwala does not guarantee a job, an interview or the accuracy of a listing. Never pay anyone for a job, and report such requests to us.')}
${section('Paid services', 'Paid plans are charged as shown at checkout, including applicable taxes. Credits and features are valid for the plan period.')}
${section('Suspension', 'We may suspend or remove accounts and content that break these terms.')}
${section('Liability', 'The platform is provided as is. To the extent the law allows, we are not liable for decisions made by users or for losses arising from use of the platform.')}
${section('Changes', 'We may update these terms. Continuing to use the platform means you accept the updated terms.')}`,
  'cookie-policy': `<p>We use cookies and similar storage to keep you logged in, remember your preferences, and keep the platform secure.</p>
${section('Essential cookies', 'These are needed for login and security, and the site does not work properly without them.')}
${section('Preferences', 'These remember choices such as your sidebar layout and recent searches on your device.')}
${section('Managing cookies', 'You can clear or block cookies in your browser, but some features may stop working.')}`,
  'employer-terms': `<p>These terms apply to employers and consultancies using Freejobwala.</p>
${section('Verification', 'You must be authorized to hire for your organization and provide accurate KYC documents.')}
${section('Job postings', 'Post only genuine vacancies. Do not charge candidates any fee for applying, interviews or placement.')}
${section('Candidate data', 'Use candidate data only for hiring. Do not resell it or contact candidates for unrelated purposes.')}
${section('Plans and credits', 'Credits are used as described in your plan and are valid for the plan period.')}
${section('Enforcement', 'We may remove jobs or suspend accounts that break these terms.')}`,
  'job-posting-policy': `<p>Every job on Freejobwala must follow this policy.</p>
<ul><li>The vacancy must be real and currently open.</li><li>Title, location, salary and requirements must be accurate.</li><li>Candidates must never be asked to pay.</li><li>Discriminatory or misleading content is not allowed.</li><li>Do not post multi-level marketing or work-from-home schemes that require a deposit.</li></ul>
<p>Jobs that break this policy may be removed without notice.</p>`,
  disclaimer: `<p>Freejobwala is a platform that connects candidates and employers. We review employers, but we do not guarantee any job, employer or listing.</p>
<p>Please verify an opportunity before sharing sensitive information. Never pay money for a job, and report suspicious activity to us.</p>`,
};

await connectDatabase();
let updated = 0;
for (const [slug, content] of Object.entries(PAGES)) {
  const res = await Page.updateOne({ slug, content: /edit from the admin panel/ }, { $set: { content } });
  updated += res.modifiedCount;
  console.log(`${slug}: ${res.modifiedCount ? 'updated' : 'left unchanged'}`);
}
console.log(`Updated ${updated} pages`);
await disconnectDatabase();
