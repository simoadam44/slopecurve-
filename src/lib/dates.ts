// Pure UTC date helpers shared by the sitemap and structured data.
// Never substitutes "now": invalid or missing values return null so callers omit the field.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?(?:(Z)|([+-])(\d{2}):?(\d{2}))?$/;

/**
 * Normalize a stored timestamp to an ISO-8601 UTC string, or null when unusable.
 * Accepts ISO input and SQLite `datetime('now')` output ("YYYY-MM-DD HH:MM:SS", UTC).
 * Calendar components are validated strictly, so "2026-02-30" is rejected instead of
 * silently rolling over into March.
 */
export function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw.length > 40) return null;

  const match = DATE_RE.exec(raw);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction, , sign, offsetHours, offsetMinutes] = match;
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = hour === undefined ? 0 : Number(hour);
  const mi = minute === undefined ? 0 : Number(minute);
  const s = second === undefined ? 0 : Number(second);
  const ms = fraction === undefined ? 0 : Number(fraction.padEnd(3, "0"));

  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (h > 23 || mi > 59 || s > 59) return null;

  const utc = new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms));
  if (
    utc.getUTCFullYear() !== y ||
    utc.getUTCMonth() !== mo - 1 ||
    utc.getUTCDate() !== d ||
    utc.getUTCHours() !== h ||
    utc.getUTCMinutes() !== mi ||
    utc.getUTCSeconds() !== s
  ) {
    return null;
  }

  if (sign) {
    const oh = Number(offsetHours);
    const om = Number(offsetMinutes);
    if (oh > 23 || om > 59) return null;
    const offsetMs = (sign === "-" ? -1 : 1) * (oh * 60 + om) * 60_000;
    return new Date(utc.getTime() - offsetMs).toISOString();
  }
  return utc.toISOString();
}

/** First usable timestamp from the given candidates (e.g. updated_at, then published_at). */
export function firstIsoDate(...values: unknown[]): string | null {
  for (const value of values) {
    const iso = toIsoDate(value);
    if (iso) return iso;
  }
  return null;
}
