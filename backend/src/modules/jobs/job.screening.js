/**
 * PRD "Fraud detection" for job posts: the most common job scam is asking candidates to pay.
 * A post that mentions such a fee goes to admin review instead of going live, with the reason.
 */
const MONEY_PATTERNS = [
  /\b(registration|joining|security|training|processing|application|interview|placement|kit|uniform|verification|document(ation)?)\s+(fee|fees|charge|charges|deposit|amount)\b/i,
  /\b(pay|deposit|transfer|submit)\s+(rs\.?|inr|₹)?\s?\d{2,}/i,
  /\brefundable\s+(fee|deposit|amount)\b/i,
  /\b(fee|fees|charges?)\s+(of|is|:)?\s*(rs\.?|inr|₹)\s?\d+/i,
  /\b(paytm|phonepe|google\s?pay|gpay|upi)\s+(kare|karein|karo|to|on|number)\b/i,
];
const SAFE_CONTEXT = /\b(no|zero|free of|without any)\s+(registration\s+|joining\s+|security\s+)?(fee|fees|charges?|deposit)\b/gi;

/** Returns the matching phrase when the job text asks candidates for money, else null. */
export function moneyRequestIn(job) {
  const text = [job.title, job.description, job.responsibilities, ...(job.questions || []).map((q) => q.question)]
    .filter(Boolean)
    .join('\n')
    .replace(SAFE_CONTEXT, ' ');
  for (const re of MONEY_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0].trim();
  }
  return null;
}
