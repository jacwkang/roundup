import { BookingError } from '../types';
export class BrowserHandoff extends BookingError {
  constructor(public reason: string, public url = 'https://resy.com/') { super('browser_handoff'); }
}
export function safeURL(raw: string): string {
  const u = new URL(raw, 'https://resy.com');
  if (u.protocol !== 'https:' || u.hostname !== 'resy.com' || u.port || u.username || u.password ||
      !/^\/(?:cities\/[a-z0-9-]+(?:\/search|\/venues\/[a-z0-9-]+)?\/?)?$/.test(u.pathname)) throw new BrowserHandoff('unsupported_navigation');
  for (const k of [...u.searchParams.keys()]) if (!['query','date','seats'].includes(k)) u.searchParams.delete(k);
  u.hash = ''; return u.toString();
}
export function venueURL(raw: string): string | undefined {
  try { const u = new URL(safeURL(raw)); if (!/\/venues\/[a-z0-9-]+\/?$/.test(u.pathname)) return; u.search = ''; return u.toString(); } catch { return; }
}
export function redact(s: string) {
  return s.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(?:\+?\d[\d ().-]{8,}\d)/g, '[number]');
}
export function checkPage(text: string) {
  if (/captcha|verify (?:that )?you(?:'re| are) human|access denied|unusual traffic|security challenge/i.test(text)) throw new BrowserHandoff('provider_challenge');
  if (/verification code|one.time (?:password|code)|enter your password/i.test(text)) throw new BrowserHandoff('login_required');
  if (/confirm (?:your )?reservation|complete (?:your )?booking|card number|payment details/i.test(text)) throw new BrowserHandoff('checkout_requires_human');
}
export type Stage = 'playwright' | 'dom' | 'dom_llm' | 'screenshot' | 'human';
export async function ladder<T>(steps: { stage: Stage; run: () => Promise<T | undefined> }[], trace: (stage: Stage) => void): Promise<T> {
  for (const step of steps) { trace(step.stage); const result = await step.run(); if (result !== undefined) return result; }
  trace('human'); throw new BrowserHandoff('no_verified_result');
}
