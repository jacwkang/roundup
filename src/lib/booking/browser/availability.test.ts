import { describe,expect,it } from 'vitest';
import type { Venue } from '../types';
import { parseAvailability, selectedDateLabel, time24, type AvailabilityDOM } from './availability';
const venue:Venue={id:123,name:'Test Brasserie',locality:'New York',timeZone:'America/New_York',source:'browser',url:'https://resy.com/cities/new-york-ny/venues/test-brasserie'};
const day='2099-09-26';
// Sanitized contract from live Resy: selected date accessibility label, guest/time selects,
// and separate reservation-button time/seating children. Inventory IDs are synthetic.
function dom():AvailabilityDOM {
 return {heading:venue.name,selectedDates:[selectedDateLabel(day)],parties:['2'],times:['All Day'],text:'Restaurant availability',loading:false,
  buttons:[{time:'9:00 AM',seating:'Indoor',token:`reservation-button-rgs://resy/123/456/1/${day}/${day}/09:00:00/2/Indoor`,disabled:false},
   {time:'9:00 AM',seating:'Outdoor',token:`reservation-button-rgs://resy/123/456/1/${day}/${day}/09:00:00/2/Outdoor`,disabled:false},
   {time:'10:30 PM',seating:'Indoor',token:`reservation-button-rgs://resy/123/456/1/${day}/${day}/22:30:00/2/Indoor`,disabled:false}]};
}
describe('browser availability contract',()=>{
 it('accepts the observed CheLi seating alias without changing the displayed label or token',()=>{
  const cheli={...venue,name:'CheLi - Manhattan',url:'https://resy.com/cities/new-york-ny/venues/cheli-manhattan'};
  const data=dom();data.heading=cheli.name;data.buttons=[{...data.buttons[0],seating:'cheli',token:data.buttons[0].token.replace('/Indoor','/Table')}];
  const slots=parseAvailability(data,cheli,day,2);
  expect(slots[0].seating).toBe('cheli');expect(slots[0].configToken).toMatch(/\/Table$/);
  expect(()=>parseAvailability({...data,heading:venue.name},venue,day,2)).toThrow();
  expect(()=>parseAvailability(data,{...cheli,url:venue.url},day,2)).toThrow();
  data.buttons[0].token=data.buttons[0].token.replace('/2/Table','/4/Table');
  expect(()=>parseAvailability(data,cheli,day,2)).toThrow();
 });
 it('preserves date, party, zone and distinct seating at the same time',()=>{
  const slots=parseAvailability(dom(),venue,day,2);
  expect(slots.map(s=>[s.time,s.seating])).toEqual([['09:00','Indoor'],['09:00','Outdoor'],['22:30','Indoor']]);
  expect(new Set(slots.map(s=>s.id)).size).toBe(3);
  expect(slots.every(s=>s.day===day && s.party===2 && s.venue.timeZone==='America/New_York' && s.venue.source==='browser')).toBe(true);
 });
 it('converts noon and midnight correctly without host timezone interpretation',()=>{
  expect(time24('12:00 AM')).toBe('00:00');expect(time24('12:00 PM')).toBe('12:00');expect(time24('1:05 PM')).toBe('13:05');
  for(const bad of ['13:00 PM','0:00 AM','9:60 AM','9 PM','7:00'])expect(()=>time24(bad)).toThrow();
 });
 it.each(['date','party','time','loading','ambiguous'])('rejects %s control mismatches',field=>{
  const data=dom();
  if(field==='date')data.selectedDates=[selectedDateLabel('2099-09-27')];
  if(field==='party')data.parties=['4'];
  if(field==='time')data.times=['19:00'];
  if(field==='loading')data.loading=true;
  if(field==='ambiguous')data.selectedDates.push(selectedDateLabel(day));
  expect(()=>parseAvailability(data,venue,day,2)).toThrow('browser_handoff');
 });
 it('rejects stale slots even when the visible controls already show the requested date',()=>{
  const data=dom();data.buttons[0].token=data.buttons[0].token.replaceAll(day,'2099-09-25');
  expect(()=>parseAvailability(data,venue,day,2)).toThrow();
 });
 it('rejects mixed restaurant inventory on the same page',()=>{
  const data=dom();data.buttons[1].token=data.buttons[1].token.replace('resy/123/','resy/999/');
  expect(()=>parseAvailability(data,venue,day,2)).toThrow();
 });
 it.each(['party','time','seating','shape'])('rejects a slot with inconsistent %s evidence',field=>{
  const data=dom();
  if(field==='party')data.buttons[0].token=data.buttons[0].token.replace('/2/Indoor','/4/Indoor');
  if(field==='time')data.buttons[0].time='10:00 AM';
  if(field==='seating')data.buttons[0].seating='Outdoor';
  if(field==='shape')data.buttons[0].token='unrecognized-format';
  expect(()=>parseAvailability(data,venue,day,2)).toThrow();
 });
 it('rejects a different venue heading, invalid calendar day and invalid party size',()=>{
  expect(()=>parseAvailability({...dom(),heading:'Other Restaurant'},venue,day,2)).toThrow();
  expect(()=>parseAvailability(dom(),venue,'2099-02-30',2)).toThrow();
  expect(()=>parseAvailability(dom(),venue,day,0)).toThrow();
 });
 it('excludes disabled buttons and deduplicates exact duplicate buttons',()=>{
  const data=dom();data.buttons[0].disabled=true;data.buttons.push({...data.buttons[1]});
  expect(parseAvailability(data,venue,day,2).map(s=>s.seating)).toEqual(['Outdoor','Indoor']);
 });
 it('does not turn an empty or incomplete render into a sold-out claim',()=>{
  expect(()=>parseAvailability({...dom(),buttons:[],text:'Notify'},venue,day,2)).toThrow();
 });
 it('hands off on a challenge or login verification instead of extracting inventory',()=>{
  for(const text of ['Verify you are human','Enter verification code'])expect(()=>parseAvailability({...dom(),text},venue,day,2)).toThrow();
 });
});
