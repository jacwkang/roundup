import { createHash } from 'node:crypto';
import type { Page } from 'playwright';
import { daySchema, partySchema, type Slot, type Venue } from '../types';
import { BrowserHandoff, checkPage, safeURL, venueURL } from './policy';

export type AvailabilityDOM = {
  heading: string; selectedDates: string[]; parties: string[]; times: string[];
  text: string; loading: boolean;
  buttons: { time: string; seating: string; token: string; disabled: boolean }[];
};
export function selectedDateLabel(day: string) {
  daySchema.parse(day);
  return new Intl.DateTimeFormat('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})
    .format(new Date(`${day}T12:00:00Z`)) + '. Selected date.';
}
export function time24(value: string) {
  const match = /^(1[0-2]|[1-9]):([0-5]\d)\s*(AM|PM)$/i.exec(value.trim());
  if (!match) throw new BrowserHandoff('unsupported_slot_time');
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2,'0')}:${match[2]}`;
}
const normalize = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
function seatingMatches(venue: Venue, displayed: string, inventory: string) {
  if (normalize(displayed) === normalize(inventory)) return true;
  // Observed in CheLi's live DOM on 2026-09-25. Keep this alias scoped to
  // that venue; preserve the displayed label and the original inventory token.
  return venue.url !== undefined &&
    venueURL(venue.url) === 'https://resy.com/cities/new-york-ny/venues/cheli-manhattan' &&
    normalize(venue.name) === 'cheli - manhattan' &&
    normalize(displayed) === 'cheli' && normalize(inventory) === 'table';
}
export function parseAvailability(dom: AvailabilityDOM, venue: Venue, day: string, party: number): Slot[] {
  daySchema.parse(day); partySchema.parse(party); checkPage(dom.text);
  if (normalize(dom.heading) !== normalize(venue.name)) throw new BrowserHandoff('venue_mismatch',venue.url);
  if (dom.loading || dom.selectedDates.length !== 1 || dom.selectedDates[0] !== selectedDateLabel(day) ||
      dom.parties.length !== 1 || dom.parties[0] !== String(party) || dom.times.length !== 1 || dom.times[0] !== 'All Day')
    throw new BrowserHandoff('availability_controls_not_verified',venue.url);
  const slots: Slot[] = [];
  let inventoryVenue: string | undefined;
  for (const button of dom.buttons) {
    if (button.disabled) continue;
    const time = time24(button.time), seating = button.seating.trim();
    if (!seating || seating.length > 100) throw new BrowserHandoff('unknown_seating',venue.url);
    // The live DOM exposes the inventory tuple in its test ID. Cross-check it against
    // BOTH the selected controls and displayed text to reject stale mixed-date renders.
    const match = /^reservation-button-(rgs:\/\/resy\/\d+\/\d+\/\d+\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})\/(\d{2}:\d{2}):00\/(\d+)\/(.+))$/.exec(button.token);
    if (!match || match[2] !== day || match[3] !== day || match[4] !== time || Number(match[5]) !== party ||
        !seatingMatches(venue,seating,decodeURIComponent(match[6]))) throw new BrowserHandoff('slot_tuple_mismatch',venue.url);
    const venueId = new URL(match[1]).pathname.split('/')[1];
    if (inventoryVenue && inventoryVenue !== venueId) throw new BrowserHandoff('mixed_venue_inventory',venue.url);
    inventoryVenue = venueId;
    if (slots.some(s => s.time === time && s.seating === seating)) continue;
    slots.push({ id:createHash('sha256').update(`${venue.url}|${match[1]}`).digest('hex').slice(0,8).toUpperCase(),
      venue:{...venue,source:'browser'}, day, party, time, seating, configToken:match[1] });
  }
  // Missing buttons, loading, or Notify controls alone do not prove a sold-out day.
  if (!slots.length) throw new BrowserHandoff('no_verified_browser_slots',venue.url);
  return slots;
}
export async function readAvailabilityDOM(page: Page): Promise<AvailabilityDOM> {
  return page.evaluate(() => {
    const root = document.querySelector('main') ?? document.body;
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script,style,input,textarea,header,nav,[data-private]').forEach(e=>e.remove());
    return {
      heading:root.querySelector('h1')?.textContent?.trim() || '',
      text:(clone.textContent || '').replace(/\s+/g,' ').slice(0,12000),
      selectedDates:Array.from(root.querySelectorAll('button[aria-label$="Selected date."]')).filter(e=>e.getBoundingClientRect().width>0).map(e=>e.getAttribute('aria-label') || ''),
      parties:Array.from(root.querySelectorAll('select[name="party_size"]')).filter(e=>e.getBoundingClientRect().width>0).map(e=>(e as HTMLSelectElement).value),
      times:Array.from(root.querySelectorAll('select[name="time"]')).filter(e=>e.getBoundingClientRect().width>0).map(e=>(e as HTMLSelectElement).value),
      loading:Array.from(root.querySelectorAll('[aria-busy="true"],[role="progressbar"]')).some(e=>e.getBoundingClientRect().width>0),
      buttons:Array.from(root.querySelectorAll('.ReservationButtonList.ShiftInventory__shift__slots button.ReservationButton')).filter(e=>{
        const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none';
      }).slice(0,150).map(e=>({time:e.querySelector('.ReservationButton__time')?.textContent?.trim() || '',seating:e.querySelector('.ReservationButton__type')?.textContent?.trim() || '',
        token:e.getAttribute('data-testid') || '',disabled:(e as HTMLButtonElement).disabled || e.getAttribute('aria-disabled')==='true'})),
    };
  });
}
export async function inspectAvailability(page: Page, venue: Venue, day: string, party: number): Promise<Slot[]> {
  daySchema.parse(day); partySchema.parse(party);
  const canonical=venue.url && venueURL(venue.url);
  if (!canonical) throw new BrowserHandoff('browser_venue_identity_missing');
  const url=new URL(canonical); url.searchParams.set('date',day);url.searchParams.set('seats',String(party));
  await page.goto(safeURL(url.toString()),{waitUntil:'domcontentloaded'});
  await page.locator('main select[name="party_size"]').waitFor({timeout:15000});
  // Navigation sets the filters. Never click a slot, Notify, login or checkout control.
  const deadline=Date.now()+20000;
  let previous='',lastError:unknown;
  while (Date.now()<deadline) {
    const current=new URL(safeURL(page.url()));
    if (venueURL(current.toString())!==canonical || current.searchParams.get('date')!==day || current.searchParams.get('seats')!==String(party))
      throw new BrowserHandoff('venue_navigation_mismatch',url.toString());
    try {
      const slots=parseAvailability(await readAvailabilityDOM(page),venue,day,party);
      const stable=JSON.stringify(slots);
      if (stable===previous) return slots;
      previous=stable;
    } catch(error) {
      if (error instanceof BrowserHandoff && ['provider_challenge','login_required','checkout_requires_human','venue_mismatch'].includes(error.reason)) throw error;
      previous='';lastError=error;
    }
    await page.waitForTimeout(400);
  }
  throw lastError instanceof BrowserHandoff ? lastError : new BrowserHandoff('availability_not_stable',url.toString());
}
