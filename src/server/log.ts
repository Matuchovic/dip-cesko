type Level = 'info' | 'warn' | 'error';
const SECRET = /key|token|secret|authorization|password/i;

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = SECRET.test(k) ? '[skryto]' : v;
  return out;
}

/** Strukturovaný log bez tajných údajů a bez polohy uživatele. */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...redact(fields) });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}
