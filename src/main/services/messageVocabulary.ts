import { ACCOUNT_TYPES, LIST_MAIL_TYPES } from "@shared/types";

function sqlValues(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(", ");
}

// SQL plumbing derived from the engine-owned message groupings.
export const LIST_MAIL_TYPES_SQL = sqlValues(LIST_MAIL_TYPES);
export const ACCOUNT_TYPES_SQL = sqlValues(ACCOUNT_TYPES);

// Mailing Lists is an action surface, not a generic classifier bucket. Social
// messages share the list relationship only when the engine also resolved a
// concrete unsubscribe action.
export function actionableListMailSql(alias?: string): string {
  const column = (name: string) => (alias ? `${alias}.${name}` : name);
  return [
    `${column("type")} IN (${LIST_MAIL_TYPES_SQL})`,
    `${column("unsubscribe_url")} IS NOT NULL`,
    `${column("unsubscribe_url")} != ''`,
    `${column("unsubscribe_method")} IS NOT NULL`,
    `${column("unsubscribe_method")} != 'none'`,
  ].join(" AND ");
}
