type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
const rules = new Map<string, Intl.PluralRules>();
/** Tvar podle pravidel množného čísla daného jazyka ({n} se nahradí číslem). */
export function plural(locale: string, n: number, forms: Forms): string {
  let r = rules.get(locale);
  if (!r) { r = new Intl.PluralRules(locale); rules.set(locale, r); }
  return (forms[r.select(n)] ?? forms.other).replace('{n}', String(n));
}
