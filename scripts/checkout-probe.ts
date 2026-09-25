import './env';
import { Store } from '../src/lib/messaging/store';
import { readBookingConfig } from '../src/lib/booking/config';
import { browserServices } from '../src/lib/booking/browser/factory';
import { inspectAvailability } from '../src/lib/booking/browser/availability';
import { BrowserHandoff, redact, venueURL } from '../src/lib/booking/browser/policy';
import { allowCheckoutDiagnosticRequest, validateCheckoutEvidence } from '../src/lib/booking/browser/checkout-validation';
import { daySchema, partySchema } from '../src/lib/booking/types';
async function main(){
 const url=venueURL(process.argv[2] || '');
 const day=daySchema.parse(process.argv[3]),party=partySchema.parse(Number(process.argv[4]));
 const args=process.argv.slice(5),time=args.find(a=>a.startsWith('--time='))?.slice(7);
 const name=args.filter(a=>!a.startsWith('--time=')).join(' ');
 if(time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new BrowserHandoff('invalid_time');
 if(!url || !name) throw new BrowserHandoff('usage_url_day_party_venue_name');
 const config=readBookingConfig({...process.env,ARA_AI_ENABLED:'true'})!;
 const store=new Store(process.env.ARA_DATABASE_PATH || './data/ara-sendblue.db');
 try {
  const {remote,state}=browserServices(store,config);
  if(!state.read()) throw new BrowserHandoff('login_context_missing');
  const session=await remote.open();
  try {
   const page=session.page;
   await page.context().route('**/*',async route=>{
    if(!allowCheckoutDiagnosticRequest(route.request().method(),route.request().url())) return route.abort();
    await route.fallback();
   });
   const venue={id:1,name,locality:config.ARA_PILOT_CITY,timeZone:config.ARA_TIME_ZONE,source:'browser' as const,url};
   const slots=await inspectAvailability(page,venue,day,party);
   const slot=time?slots.find(s=>s.time===time):slots[0];
   if(!slot)throw new BrowserHandoff('exact_time_unavailable');
   const button=page.getByTestId(`reservation-button-${slot.configToken}`);
   if(await button.count()!==1) throw new BrowserHandoff('ambiguous_slot_control');
   const decline=page.getByRole('button',{name:'Decline All',exact:true});
   if(await decline.isVisible())await decline.click();
   await button.click();
   // Discover the observed checkout origin; never traverse arbitrary third-party frames.
   const deadline=Date.now()+10000;
   let frame=page.frames().find(f=>f.url().startsWith('https://widgets.resy.com/'));
   while(!frame && Date.now()<deadline){await page.waitForTimeout(250);frame=page.frames().find(f=>f.url().startsWith('https://widgets.resy.com/'));}
   if(!frame) throw new BrowserHandoff('checkout_frame_missing');
   await frame.getByRole('button',{name:'Reserve Now',exact:true}).waitFor();
   await frame.getByText('Cancellation policy',{exact:true}).first().waitFor();
   const evidence=await frame.evaluate(()=>({
    loginVisible:Array.from(document.querySelectorAll('button')).some(e=>e.getBoundingClientRect().width>0 && e.textContent?.trim()==='Log in'),
    reserveVisible:Array.from(document.querySelectorAll('button')).some(e=>e.getBoundingClientRect().width>0 && e.textContent?.trim()==='Reserve Now'),
    policies:[...new Set(Array.from(document.querySelectorAll('[role="dialog"]')).map(e=>e.textContent?.match(/Cancellation policy([\s\S]*?)(?:Qualifies for|About|$)/)?.[1]?.trim()).filter((s):s is string=>!!s))],
   }));
   const result=validateCheckoutEvidence(evidence);
   await session.save();
   console.log(JSON.stringify({selected:{venue:name,day,party,time:slot.time,seating:slot.seating},...result,cancellationPolicy:redact(result.cancellationPolicy)},null,2));
  }finally{await session.close();}
 }finally{store.close();}
}
main().catch(e=>{console.error(e instanceof BrowserHandoff?e.reason:'checkout_probe_failed');process.exitCode=1;});
