import React, { useMemo, useState } from 'react';
import Button from '../ui/Button';
import { Icon } from '../ui/feedback';
import { placeLabel } from '../../utils/format';

const merge = (current = [], found = [], max) => {
  const have = new Set(current.map((x) => String(x).toLowerCase()));
  const added = found.filter((x) => !have.has(String(x).toLowerCase()));
  return { added, value: [...current, ...added].slice(0, max) };
};
const expLabel = (e) => [e.years ? `${e.years} yr${e.years > 1 ? 's' : ''}` : '', e.months ? `${e.months} mo` : ''].filter(Boolean).join(' ') || 'Fresher';

/**
 * "We read your resume" card: every detail found is a suggestion with a checkbox. New list items are
 * merged; single values are pre-ticked only when the profile field is still empty.
 */
const ResumeInsights = ({ parsed, profile = {}, user = {}, onApply, applying, onDismiss }) => {
  const rows = useMemo(() => {
    const out = [];
    const key = merge(profile.keySkills, parsed.skills, 15);
    if (key.added.length) out.push({ id: 'keySkills', label: 'Key skills', value: key.added.join(', '), patch: { keySkills: key.value }, on: true });
    const it = merge(profile.itSkills, parsed.itSkills, 15);
    if (it.added.length) out.push({ id: 'itSkills', label: 'IT skills', value: it.added.join(', '), patch: { itSkills: it.value }, on: true });
    const langs = merge(profile.languages, parsed.languages, 10);
    if (langs.added.length) out.push({ id: 'languages', label: 'Languages', value: langs.added.join(', '), patch: { languages: langs.value }, on: true });
    const hasExp = profile.totalExperience && (profile.totalExperience.years || profile.totalExperience.months);
    if (parsed.totalExperience) out.push({ id: 'exp', label: 'Total experience', value: expLabel(parsed.totalExperience), patch: { totalExperience: parsed.totalExperience }, on: !hasExp, replaces: hasExp ? expLabel(profile.totalExperience) : '' });
    if (parsed.currentLocation?.city) out.push({ id: 'loc', label: 'Current location', value: placeLabel(parsed.currentLocation), patch: { currentLocation: parsed.currentLocation }, on: !profile.currentLocation?.city, replaces: profile.currentLocation?.city ? placeLabel(profile.currentLocation) : '' });
    if (parsed.profileSummary) out.push({ id: 'summary', label: 'Profile summary', value: parsed.profileSummary, patch: { profileSummary: parsed.profileSummary.slice(0, 1000) }, on: !profile.profileSummary, replaces: profile.profileSummary ? 'your current summary' : '', long: true });
    const links = (user.socialLinks || []).map((l) => l.url);
    const newLinks = [
      ['LinkedIn', parsed.linkedin],
      ['GitHub', parsed.github],
    ].filter(([, url]) => url && !links.includes(url));
    if (newLinks.length) out.push({ id: 'links', label: 'Profile links', value: newLinks.map(([, u]) => u).join(', '), patch: { socialLinks: [...(user.socialLinks || []), ...newLinks.map(([platform, url]) => ({ platform, url }))].slice(0, 15) }, on: true });
    return out;
  }, [parsed, profile, user]);
  const [picked, setPicked] = useState(() => Object.fromEntries(rows.map((r) => [r.id, r.on])));

  if (!rows.length) return null;
  const chosen = rows.filter((r) => picked[r.id]);
  return (
    <div className="animate-fade-in rounded-xl border border-brand-blue/25 bg-brand-blue-tint/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-brand-blue">
            <Icon name="auto_awesome" size={20} />
          </span>
          <div>
            <p className="text-sm font-bold text-brand-dark">We read your resume</p>
            <p className="text-xs text-brand-gray">Pick the details to add to your profile. Nothing changes until you apply.</p>
          </div>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss suggestions" className="text-brand-gray-muted hover:text-brand-dark">
          <Icon name="close" size={18} />
        </button>
      </div>
      <ul className="divide-y divide-brand-blue/10 rounded-lg bg-white">
        {rows.map((r) => (
          <li key={r.id}>
            <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
              <input type="checkbox" className="mt-0.5" checked={Boolean(picked[r.id])} onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.checked }))} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-brand-gray-muted">{r.label}</span>
                <span className={r.long ? 'line-clamp-3 block text-sm text-brand-dark' : 'block text-sm text-brand-dark [overflow-wrap:anywhere]'}>{r.value}</span>
                {r.replaces && <span className="mt-0.5 block text-xs text-[#8A5A00]">Replaces {r.replaces}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Not now
        </Button>
        <Button size="sm" variant="primaryBlue" disabled={!chosen.length} loading={applying} onClick={() => onApply(Object.assign({}, ...chosen.map((r) => r.patch)))}>
          Add {chosen.length || ''} to profile
        </Button>
      </div>
    </div>
  );
};

export default ResumeInsights;
