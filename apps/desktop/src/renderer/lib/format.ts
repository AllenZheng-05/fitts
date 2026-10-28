/** Fills `{name}` placeholders in a copy string. Unknown placeholders are left as is. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** `$1.84`; whole caps drop the cents: `$20`. */
export function formatUsd(amount: number, { dropWholeCents = false } = {}): string {
  if (dropWholeCents && Number.isInteger(amount)) return `$${amount}`;
  return `$${amount.toFixed(2)}`;
}
