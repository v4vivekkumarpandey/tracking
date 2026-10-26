// Publisher tracking parameters (Everflow-style): source_id plus sub1–sub10.
// Taken from the tracking link, stored on the click, copied to its
// conversions, and usable as {macros} in landing pages and publisher postbacks.

export const SUBS = ['sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8', 'sub9', 'sub10'] as const;
export const SUB_FIELDS = ['source_id', ...SUBS] as const;
export type SubField = (typeof SUB_FIELDS)[number];
export type SubValues = Record<SubField, string>;

export function subsFrom(sp: URLSearchParams): SubValues {
  return Object.fromEntries(SUB_FIELDS.map((k) => [k, (sp.get(k) ?? '').slice(0, 255)])) as SubValues;
}

/** "c.source_id, c.sub1, …, c.sub10" for SQL column lists. */
export const subColumns = (alias = '') => SUB_FIELDS.map((k) => `${alias}${k}`).join(', ');
