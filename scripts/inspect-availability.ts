import './env';
import { Store } from '../src/lib/messaging/store';
import { readBookingConfig } from '../src/lib/booking/config';
import { browserServices } from '../src/lib/booking/browser/factory';
import { readAvailabilityDOM } from '../src/lib/booking/browser/availability';
import { safeURL, BrowserHandoff } from '../src/lib/booking/browser/policy';
async function main(){
 const config=readBookingConfig({...process.env,ARA_AI_ENABLED:'true'})!;
 const store=new Store(process.env.ARA_DATABASE_PATH || './data/ara-sendblue.db');
 try{
 const {remote}=browserServices(store,config),session=await remote.open();
 try{
 const u=new URL(safeURL(process.argv[2]));u.searchParams.set('date',process.argv[3]);u.searchParams.set('seats',process.argv[4]);
 await session.page.goto(u.toString(),{waitUntil:'domcontentloaded'});
 await session.page.locator('.ReservationButtonList.ShiftInventory__shift__slots button.ReservationButton').first().waitFor({timeout:15000});
 const dom=await readAvailabilityDOM(session.page);
 console.log(JSON.stringify({heading:dom.heading,selectedDates:dom.selectedDates,parties:dom.parties,times:dom.times,loading:dom.loading,buttons:dom.buttons.map(b=>{
 const parts=b.token.replace(/^reservation-button-/,'').split('/');
 return {time:b.time,seating:b.seating,disabled:b.disabled,tuple:parts.slice(6)};
 })},null,2));
 }finally{await session.close();}
 }finally{store.close();}
}
main().catch(e=>{console.error(e instanceof BrowserHandoff?e.reason:'availability_inspection_failed');process.exitCode=1;});
