/** Lightweight RFC4122 v4-ish UUID generator for client-assigned grouping ids (e.g. superset_group_id).
 * Not cryptographically strong — fine for a non-security grouping key that Postgres just stores as `uuid`. */
export function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
