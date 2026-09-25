import './env';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Store } from '../src/lib/messaging/store';
import { readBookingConfig } from '../src/lib/booking/config';
import { browserServices } from '../src/lib/booking/browser/factory';
import { BrowserHandoff, safeURL } from '../src/lib/booking/browser/policy';
async function main() {
  const config = readBookingConfig({ ...process.env, ARA_AI_ENABLED:'true' })!;
  const store = new Store(process.env.ARA_DATABASE_PATH || './data/ara-sendblue.db');
  try {
    const { remote, state, provider } = browserServices(store,config);
    const command = process.argv[2];
    if (command === 'disconnect') { state.clear(); console.log('Encrypted browser login removed.'); return; }
    if (command === 'search') { console.log(JSON.stringify(await provider.search(process.argv.slice(3).join(' ')),null,2)); return; }
    if (command === 'slots' || command === 'quote') {
      const url=safeURL(process.argv[3]);
      const args=process.argv.slice(6),time=args.find(a=>a.startsWith('--time='))?.slice(7);
      const day=process.argv[4],party=Number(process.argv[5]),name=args.filter(a=>!a.startsWith('--time=')).join(' ');
      if(time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new BrowserHandoff('invalid_time');
      if (!name) throw new BrowserHandoff('usage_slots_url_day_party_venue_name');
      const slots=await provider.slots({id:parseInt(createHash('sha256').update(url).digest('hex').slice(0,7),16)+1,name,locality:config.ARA_PILOT_CITY,timeZone:config.ARA_TIME_ZONE,source:'browser',url},day,party);
      if(command==='quote'){const selected=time?slots.find(s=>s.time===time):slots[0];if(!selected)throw new BrowserHandoff('exact_time_unavailable',url);const details=await provider.details(selected);console.log(JSON.stringify({venue:name,day,party,time:selected.time,seating:selected.seating,terms:details.terms,requiresPaymentSetup:details.requiresPaymentSetup,expires:details.expires,bookingSubmitted:false},null,2));return;}
      console.log(JSON.stringify({venue:name,day,party,timeZone:config.ARA_TIME_ZONE,count:slots.length,slots:slots.map(({time,seating})=>({time,seating}))},null,2));return;
    }
    if (!['login','check'].includes(command)) throw new BrowserHandoff('use_login_check_search_slots_disconnect');
    const session = await remote.open(command === 'login');
    try {
      await session.page.goto('https://resy.com/',{waitUntil:'domcontentloaded'});
      if (command === 'check') { console.log('Steel CDP connected; Resy page opened. No booking attempted.'); return; }
      if (!process.stdin.isTTY) throw new BrowserHandoff('interactive_terminal_required');
      console.log(`Open this private Steel viewer to sign into your own Resy account: ${session.viewer}`);
      console.log('This is an isolated cloud browser. No personal Chrome profile is attached. Session expires after five minutes.');
      const input = createInterface({input:process.stdin,output:process.stdout});
      try {
        const answer = await input.question('After signing in, type save to store the browser session encrypted (anything else cancels): ');
        if (answer.trim() === 'save') { await session.save(); console.log('Browser context encrypted locally. This does not verify booking access or make a reservation.'); }
      } finally { input.close(); }
    } finally { await session.close(); }
  } finally { store.close(); }
}
main().catch(e => { console.error(e instanceof BrowserHandoff ? `Browser handoff: ${e.reason}` : 'Browser operation failed; no raw provider errors were logged.'); process.exitCode=1; });
