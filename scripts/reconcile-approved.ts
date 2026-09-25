import './env';
import { Store } from '../src/lib/messaging/store';
import { readBookingConfig } from '../src/lib/booking/config';
import { Vault } from '../src/lib/booking/vault';
import { BookingStore } from '../src/lib/booking/store';
import { Resy } from '../src/lib/booking/resy';
import { BookingError } from '../src/lib/booking/types';
async function main(){
 const config=readBookingConfig({...process.env,ARA_AI_ENABLED:'true'})!;
 const messages=new Store(process.env.ARA_DATABASE_PATH || './data/ara-sendblue.db');
 try{
 const vault=new Vault(messages.db,config.ARA_CREDENTIAL_KEY),store=new BookingStore(messages,vault);
 const attempt=store.attempts(config.ARA_BOOKING_OWNER).find(a=>a.id===process.argv[2]);
 if(!attempt)throw new BookingError('attempt_not_found');
 const slot=attempt.quote.slot;
 const actualVenue=Number(new URL(slot.configToken).pathname.split('/')[1]);
 const resy=new Resy(config,()=>vault.token(config.ARA_BOOKING_OWNER));
 const reservations=await resy.reservations();
 const matches=reservations.filter(r=>r.venueId===actualVenue && r.day===slot.day && r.time===slot.time && r.party===slot.party);
 if(matches.length===1){store.confirm(attempt.id,matches[0].id);console.log(JSON.stringify({state:'confirmed',attempt:attempt.id,reference:matches[0].id}));}
 else if(matches.length===0 && process.argv[3]==='--owner-confirmed-none'){
 store.resolveNotBooked(config.ARA_BOOKING_OWNER,attempt.id,'Owner explicitly reported no reservation in Resy app; a fresh read-only API lookup also returned zero exact venue/date/time/party matches. No automatic retry was performed.');
 console.log(JSON.stringify({state:'not_booked',attempt:attempt.id,ownerConfirmed:true,matchingReservations:0}));
 }else console.log(JSON.stringify({state:'unknown',matchingReservations:matches.length,attempt:attempt.id}));
 }finally{messages.close();}
}
main().catch(e=>{console.error(e instanceof BookingError?e.code:'reconciliation_unverified');process.exitCode=1;});
