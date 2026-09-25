import type { Page } from 'playwright';
import { checkPage, redact, safeURL, venueURL } from './policy';
export type Candidate = { id: number; name: string; url: string };
export type Snapshot = { url: string; text: string; candidates: Candidate[]; searchValue: string; selectedDay: string; selectedParty: string };
export async function inspect(page: Page): Promise<Snapshot> {
  const url = safeURL(page.url());
  const data = await page.evaluate(() => {
    const root = document.querySelector('main,[role="main"]') ?? document.body;
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input,textarea,script,style,header,nav,[autocomplete],[data-private]').forEach(e => e.remove());
    return { text: (clone.textContent || '').replace(/\s+/g,' ').slice(0,6000),
      links: Array.from(root.querySelectorAll('a[href]')).filter(el => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      }).slice(0,60).map(a => ({ name: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0,120), url: (a as HTMLAnchorElement).href })),
      searchValue: (document.querySelector('input[type="search"],input[placeholder*="Search" i],input[aria-label*="Search" i]') as HTMLInputElement | null)?.value || '',
      selectedDay: (document.querySelector('input[type="date"]') as HTMLInputElement | null)?.value || '',
      selectedParty: (document.querySelector('select[aria-label*="party" i],select[aria-label*="guest" i],select[name="seats"]') as HTMLSelectElement | null)?.value || '' };
  });
  checkPage(data.text);
  const candidates: Candidate[] = [];
  for (const link of data.links) {
    const href = venueURL(link.url);
    if (href && link.name && !candidates.some(c => c.url === href)) candidates.push({ id: candidates.length, name: redact(link.name), url: href });
  }
  return { url, text: redact(data.text).slice(0,4000), candidates: candidates.slice(0,20), searchValue: data.searchValue.slice(0,150), selectedDay: data.selectedDay, selectedParty: data.selectedParty };
}
export async function screenshot(page: Page) {
  await inspect(page); // Stops on checkout, login challenges or off-domain navigation.
  const root = page.locator('main,[role="main"]').first();
  if (!await root.count()) return undefined;
  // Never include typed fields or the account header. Images remain in memory, not logs or disk.
  const box = await root.boundingBox(), viewport = page.viewportSize() ?? { width: 1100, height: 800 };
  if (!box) return undefined;
  const x = Math.max(0,box.x), y = Math.max(0,box.y);
  const width = Math.min(box.x + box.width,viewport.width,1100) - x;
  const height = Math.min(box.y + box.height,viewport.height,800) - y;
  if (width <= 0 || height <= 0) return undefined;
  return page.screenshot({ type: 'jpeg', quality: 55, timeout: 5000, clip: { x,y,width,height },
    mask: [page.locator('input,textarea,header,nav,[autocomplete],[data-private]')] });
}
