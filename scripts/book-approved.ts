import './env';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Store } from '../src/lib/messaging/store';
import { readBookingConfig } from '../src/lib/booking/config';
import { Vault } from '../src/lib/booking/vault';
import { BookingStore } from '../src/lib/booking/store';
import { browserServices } from '../src/lib/booking/browser/factory';
import { BrowserPreflightError } from '../src/lib/booking/browser/checkout';
import { code } from '../src/lib/booking/resy';
import { daySchema, partySchema, BookingError } from '../src/lib/booking/types';
import { BrowserHandoff, venueURL } from '../src/lib/booking/browser/policy';
async function main(){
 const approval=z.object({venue:z.string(),url:z.string(),day:daySchema,party:partySchema,time:z.string().regex(/^\d{2}:\d{2}$/),seating:z.string(),terms:z.string(),expires:z.number(),evidence:z.string().min(1)}).strict().parse(JSON.parse(readFileSync(process.argv[2],'utf8')));
 if(process.argv[3]!=='--submit-approved' || approval.expires<=Date.now())throw new BookingError('approval_missing_or_expired');
 const config=readBookingConfig({...process.env,ARA_AI_ENABLED:'true',ARA_BOOKINGS_ENABLED:'true'})!;
 const messages=new Store(process.env.ARA_DATABASE_PATH || './data/ara-sendblue.db');
 try{
  const store=new BookingStore(messages,new Vault(messages.db,config.ARA_CREDENTIAL_KEY));
  if(store.attempts(config.ARA_BOOKING_OWNER).some(a=>a.state==='unknown' || a.quote.slot.day===approval.day))throw new BookingError('existing_or_unresolved_booking');
  const {checkout}=browserServices(messages,config);
  const url=venueURL(approval.url);if(!url)throw new BookingError('invalid_venue_url');
  const slot={id:code(),venue:{id:1,name:approval.venue,url,locality:config.ARA_PILOT_CITY,timeZone:config.ARA_TIME_ZONE,source:'browser' as const},day:approval.day,party:approval.party,time:approval.time,seating:approval.seating,configToken:''};
  let attempt:string|undefined;
  try{
   const result=await checkout.submitApproved(slot,approval.terms,approval.expires,(verified,details)=>{
    const quote={id:code(),source:'browser' as const,slot:verified,terms:details.terms,fingerprint:details.fingerprint,expires:details.expires};
    attempt=store.beginOperator(config.ARA_BOOKING_OWNER,quote,JSON.stringify(approval));
    console.log(JSON.stringify({attempt,state:'unknown',stage:'durable_before_submission'}));
   });
   if(!attempt)throw new BookingError('attempt_missing');
   store.confirm(attempt,result.reference,result.managementToken);
   console.log(JSON.stringify({attempt,state:'confirmed',reference:result.reference,venue:approval.venue,day:approval.day,time:approval.time,party:approval.party,seating:approval.seating}));
  }catch(error){
   if(attempt && error instanceof BrowserPreflightError)store.resolveNotBooked(config.ARA_BOOKING_OWNER,attempt,`Browser preparation failed before submission: ${error.code}. No booking request could be sent.`);
   console.log(JSON.stringify({attempt,state:attempt && !(error instanceof BrowserPreflightError)?'unknown':'not_booked',reason:error instanceof BrowserHandoff?error.reason:error instanceof BookingError?error.code:'unverified_result'}));process.exitCode=1;
  }
 }finally{messages.close();}
}
main().catch(error=>{console.error(error instanceof BrowserHandoff?error.reason:error instanceof BookingError?error.code:'approved_booking_failed');process.exitCode=1;});
