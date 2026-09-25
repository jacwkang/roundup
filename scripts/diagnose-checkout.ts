import './env';
import { Store } from '../src/lib/messaging/store';
import { readBookingConfig } from '../src/lib/booking/config';
import { Vault } from '../src/lib/booking/vault';
import { BookingStore } from '../src/lib/booking/store';
import { browserServices } from '../src/lib/booking/browser/factory';
import { BrowserHandoff } from '../src/lib/booking/browser/policy';
async function main(){
 const config=readBookingConfig({...process.env,ARA_AI_ENABLED:'true'})!;
 const messages=new Store(process.env.ARA_DATABASE_PATH || './data/ara-sendblue.db');
 try{
 const store=new BookingStore(messages,new Vault(messages.db,config.ARA_CREDENTIAL_KEY));
 const attempt=store.attempts(config.ARA_BOOKING_OWNER).find(a=>a.id===process.argv[2]);
 if(!attempt)throw new BrowserHandoff('attempt_missing');
 const {checkout}=browserServices(messages,config);
 console.log(JSON.stringify(await checkout.diagnose(attempt.quote.slot),null,2));
 }finally{messages.close();}
}
main().catch(e=>{console.error(e instanceof BrowserHandoff?e.reason:e instanceof Error?`${e.name}: ${e.message.split('\n')[0].replace(/https?:\/\/\S+/g,'[url]')}`:'diagnostic_failed');process.exitCode=1;});
