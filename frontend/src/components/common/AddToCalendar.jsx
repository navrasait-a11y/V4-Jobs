import React, { useRef, useState } from 'react';
import { Icon } from '../ui/feedback';
import { Popover } from '../ui/pickers';

const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s = '') => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

/** Event details for an interview (title, times, where, notes). */
export function interviewEvent(iv, { jobTitle, company } = {}) {
  const start = new Date(iv.scheduledAt);
  const end = new Date(start.getTime() + (iv.durationMinutes || 30) * 60000);
  const where = iv.mode === 'video' ? iv.meetingLink : iv.mode === 'in_person' ? iv.location : 'Phone call';
  const title = `Interview${jobTitle ? `: ${jobTitle}` : ''}${company ? ` at ${company}` : ''}${iv.round ? ` (${iv.round})` : ''}`;
  const details = [iv.mode === 'video' && iv.meetingLink ? `Join: ${iv.meetingLink}` : '', iv.notes || '', 'Scheduled on Freejobwala'].filter(Boolean).join('\n');
  return { uid: `${iv._id || stamp(start)}@freejobwala`, title, start, end, where: where || '', details };
}

export const googleCalendarUrl = (e) =>
  `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${stamp(e.start)}/${stamp(e.end)}`, details: e.details, location: e.where })}`;

export function icsText(e) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Freejobwala//Interviews//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(e.details)}`,
    e.where ? `LOCATION:${esc(e.where)}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Interview in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

function downloadIcs(e) {
  const url = URL.createObjectURL(new Blob([icsText(e)], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'interview.ics' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "Add to calendar": Google Calendar, or an .ics file for Outlook / Apple Calendar / phones. */
const AddToCalendar = ({ interview, jobTitle, company, className = '' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  if (!interview?.scheduledAt || ['cancelled', 'completed', 'no_show'].includes(interview.status) || new Date(interview.scheduledAt) < new Date()) return null;
  const event = interviewEvent(interview, { jobTitle, company });
  const item = 'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-brand-dark hover:bg-brand-tint';
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline ${className}`}>
        <Icon name="event" size={15} /> Add to calendar
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} title="Add to calendar" minWidth={220}>
        <div className="p-1.5">
          <a className={item} href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <Icon name="calendar_month" size={18} className="text-brand-blue" /> Google Calendar
          </a>
          <button
            type="button"
            className={item}
            onClick={() => {
              downloadIcs(event);
              setOpen(false);
            }}
          >
            <Icon name="download" size={18} className="text-brand-blue" /> Outlook / Apple (.ics)
          </button>
        </div>
      </Popover>
    </>
  );
};

export default AddToCalendar;
