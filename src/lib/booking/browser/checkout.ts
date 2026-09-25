import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Frame, Request } from 'playwright';
import { BookingError, type Details, type Slot } from '../types';
import { fingerprint } from '../resy';
import { BrowserHandoff } from './policy';
import { inspectAvailability } from './availability';
import { allowCheckoutDiagnosticRequest } from './checkout-validation';
import type { SteelBrowser } from './steel';

const zero=z.literal(0);
const serviceCharge=z.object({amount:zero,value:z.literal('0%')}).strict();
const optionAmounts=z.object({price_per_unit:zero,resy_fee:zero,service_fee:zero,service_charge:serviceCharge,tax:zero,total:zero}).strict();
const schema=z.object({
 payment:z.object({
  amounts:optionAmounts.extend({items:z.array(z.never()),reservation_charge:zero,subtotal:zero,add_ons:zero,quantity:z.number().int(),surcharge:zero}).strict(),
  comp:z.literal(false),config:z.object({type:z.literal('free')}).strict(),
  display:z.object({balance:z.object({value:z.literal(''),modifier:z.literal('')}).strict(),buy:z.object({action:z.literal('NOW'),after_modifier:z.literal(''),before_modifier:z.literal(''),init:z.literal(''),value:z.literal('RESERVE')}).strict(),description:z.array(z.never())}).strict(),
  options:z.array(z.object({amounts:optionAmounts}).strict()).length(1),
 }).strict(),
 cancellation:z.object({
  credit:z.object({date_cut_off:z.null()}).strict(),
  display:z.object({policy:z.array(z.string().min(1).max(2000)).length(1)}).strict(),
  fee:z.object({amount:z.number().finite().nonnegative(),tax:z.null(),display:z.object({amount:z.string()}).strict(),date_cut_off:z.string().datetime()}).strict().nullable(),
  refund:z.object({date_cut_off:z.string().datetime()}).strict(),
 }).strict(),
 change:z.object({date_cut_off:z.string().datetime()}).strict(),user:z.object({payment_methods:z.array(z.object({id:z.number().int().positive()}).passthrough()).nullable()}),
 config:z.object({is_event:z.literal(false)}),
 book_token:z.object({value:z.string().min(1),date_expires:z.string()}).optional(),
});
export function readCheckoutTerms(raw: unknown, slot: Slot, displayedPolicy: string, account: string) {
 const parsed=schema.safeParse(raw);
 if(!parsed.success) throw new BrowserHandoff('unsupported_browser_financial_terms');
 const data=parsed.data,c=data.cancellation;
 if(data.payment.amounts.quantity!==slot.party || data.change.date_cut_off!==c.refund.date_cut_off || c.display.policy[0].trim()!==displayedPolicy.trim())
  throw new BrowserHandoff('browser_terms_mismatch');
 let terms:string;
 if(c.fee===null){
  if(displayedPolicy.trim()!=="While you won't be charged if you need to cancel, we ask that you do so at least 24 hours in advance.")throw new BrowserHandoff('unsupported_browser_cancellation_policy');
  const cutoff=new Date(c.refund.date_cut_off);
  const localDay=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:slot.venue.timeZone}).format(cutoff);
  const localTime=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:slot.venue.timeZone}).format(cutoff);
  if(localDay!==slot.day || localTime!==slot.time)throw new BrowserHandoff('browser_terms_mismatch');
  terms=`No upfront payment and no cancellation charge. Cancellation policy: ${displayedPolicy.trim()} Manage or cancel directly in Resy.`;
 }else{
 if(c.refund.date_cut_off!==c.fee.date_cut_off)throw new BrowserHandoff('browser_terms_mismatch');
 const deadline=new Date(c.fee.date_cut_off);
 const parts=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true,timeZone:slot.venue.timeZone}).formatToParts(deadline);
 const part=(type:string)=>parts.find(p=>p.type===type)?.value;
 const displayedDeadline=`${part('weekday')}, ${part('month')}. ${part('day')} at ${part('hour')}:${part('minute')}${part('dayPeriod')?.toLowerCase()}`;
 if(!displayedPolicy.startsWith(`A cancellation fee will not be charged if you cancel before ${displayedDeadline}.`))throw new BrowserHandoff('browser_cancellation_deadline_mismatch');
 const fee=c.fee.amount.toFixed(2);
 const expected=new RegExp(`^A cancellation fee will not be charged if you cancel before [^\\n]+\\.\\s*If you cancel after that, you agree to be charged a fee of \\$${fee.replace('.', '\\.')} \\+ tax per guest on the reservation\\. Any waiver of the fee is at the sole discretion of the restaurant\\.$`);
 if(!expected.test(displayedPolicy.trim()) || c.fee.display.amount!==`$${fee}`) throw new BrowserHandoff('unsupported_browser_cancellation_policy');
 terms=`No upfront payment. Cancellation policy: ${displayedPolicy.trim()}\nCancellation deadline: ${new Intl.DateTimeFormat('en-US',{dateStyle:'full',timeStyle:'short',timeZone:slot.venue.timeZone}).format(new Date(c.fee.date_cut_off))} (${slot.venue.timeZone}). For ${slot.party} guests, the stated late-cancellation fee is $${(c.fee.amount*slot.party).toFixed(2)} plus tax total. Changes are also limited by this deadline. Manage or cancel directly in Resy.`;
 }
 const expiry=data.book_token?.date_expires;
 const tokenExpires=expiry && /(Z|[+-]\d{2}:?\d{2})$/.test(expiry) ? Date.parse(expiry) : Date.now()+60000;
 if(!Number.isFinite(tokenExpires) || tokenExpires<=Date.now())throw new BrowserHandoff('browser_booking_token_expired');
 return {tokenExpires,requiresPaymentSetup:!data.user.payment_methods?.length,terms,fingerprint:fingerprint({account,slot:{url:slot.venue.url,day:slot.day,time:slot.time,party:slot.party,seating:slot.seating},payment:data.payment,cancellation:c,change:data.change,user:data.user}),token:data.book_token?.value};
}
export class SubmissionGate {
 private armed=false;
 private used=false;
 constructor(private token:string,private expires:number) {}
 arm(){this.armed=true;}
 accept(method:string,raw:string,body:string,origin:string){
  const url=new URL(raw);
  if(!this.armed || this.used || Date.now()>=this.expires || method!=='POST' || url.origin!=='https://api.resy.com' || url.pathname!=='/3/book' || url.search || origin!=='https://widgets.resy.com') return false;
  if(body.trimStart().startsWith('{')){
   try{const parsed=JSON.parse(body);if(parsed.book_token!==this.token)return false;}catch{return false;}
  }else{
   const params=new URLSearchParams(body);
   if(params.getAll('book_token').length!==1 || params.get('book_token')!==this.token) return false;
  }
  this.used=true;return true;
 }
}
export function bookingConfirmation(raw:unknown){
 const parsed=z.object({reservation_id:z.union([z.string().min(1).max(200),z.number().int().positive()]).optional(),resy_token:z.string().min(1).max(10000).optional()}).safeParse(raw);
 if(!parsed.success || (raw as {error?:unknown}).error != null || (!parsed.data.reservation_id && !parsed.data.resy_token)) throw new BookingError('browser_confirmation_unverified',true);
 return {reference:parsed.data.reservation_id==null?null:String(parsed.data.reservation_id),managementToken:parsed.data.resy_token};
}

export async function prepareCheckoutButton(frame:Frame){
 const button=frame.getByRole('button',{name:'Reserve Now',exact:true});
 for(let pass=0;pass<4;pass++){
  const iframe=await frame.frameElement();
  await iframe.evaluate(element=>(element as Element).scrollIntoView({block:'end',inline:'nearest',behavior:'instant'}));
  await button.scrollIntoViewIfNeeded();
  try{await button.click({trial:true,timeout:1200});return;}catch(error){
   if(!(error instanceof Error) || error.name!=='TimeoutError')throw error;
   if(pass===3)throw new BrowserHandoff('checkout_button_not_actionable');
   await frame.page().waitForTimeout(250);
  }
 }
}

export class BrowserPreflightError extends BookingError {
 constructor(reason:string){super(`browser_preflight_${reason}`,false);}
}

export class BrowserCheckout {
 private tickets=new Map<string,{slot:Slot;details:Details;account:string}>();
 constructor(private remote:SteelBrowser,private account:()=>string,private enabled:()=>boolean){}
 private async open(slot:Slot){
  const session=await this.remote.open();
  const page=session.page;
  let gate:SubmissionGate|undefined, submitted:Request|undefined;
  let stage='navigation';
  const responses:{raw:unknown;config:string}[]=[];
  const blocked:{method:string;path:string;bodyKeys:string[];origin:string}[]=[];
  try {
  await page.setViewportSize({width:1100,height:800});
  page.on('response',async response=>{
   const u=new URL(response.url());
   if(u.origin==='https://api.resy.com' && u.pathname==='/3/details' && response.ok()) {
    let request:{config_id?:string}|null=null;
    try{request=response.request().postDataJSON();}catch{return;}
    const value=await response.json().catch(()=>undefined);if(value) responses.push({raw:value,config:request?.config_id || u.searchParams.get('config_id') || ''});
   }
  });
  await page.context().route('**/*',async route=>{
   const r=route.request();
   let origin='';try{origin=new URL(r.frame().url()).origin;}catch{}
   if(gate?.accept(r.method(),r.url(),r.postData() || '',origin)){submitted=r;return route.continue();}
   if(!allowCheckoutDiagnosticRequest(r.method(),r.url())){
    const u=new URL(r.url());
    if(u.hostname==='api.resy.com'){let bodyKeys:string[]=[];try{bodyKeys=Object.keys(r.postDataJSON() || {});}catch{}blocked.push({method:r.method(),path:u.pathname,bodyKeys,origin});}
    return route.abort();
   }
   await route.fallback();
  });
   const slots=await inspectAvailability(page,slot.venue,slot.day,slot.party);
   const exact=slots.find(s=>s.time===slot.time && s.seating===slot.seating);
   if(!exact)throw new BrowserHandoff('exact_browser_slot_unavailable');
   const button=page.getByTestId(`reservation-button-${exact.configToken}`);
   if(await button.count()!==1)throw new BrowserHandoff('ambiguous_slot_control');
   const decline=page.getByRole('button',{name:'Decline All',exact:true});
   if(await decline.isVisible())await decline.click();
   stage='slot_click';await button.click();
   let frame:Frame|undefined;
   const deadline=Date.now()+10000;
   while(Date.now()<deadline){
    const frames=page.frames().filter(f=>f.url().startsWith('https://widgets.resy.com/'));
    if(frames.length===1){frame=frames[0];break;}
    await page.waitForTimeout(250);
   }
   if(!frame)throw new BrowserHandoff('checkout_frame_missing');
   stage='checkout_load';await frame.getByRole('button',{name:'Reserve Now',exact:true}).waitFor();
   stage='checkout_position';await prepareCheckoutButton(frame);
   const marketing=frame.locator('input[name="venue_marketing_opt_in"]');
   stage='marketing_control';if(await marketing.count()===1 && await marketing.isChecked())await marketing.uncheck();
   stage='policy_load';await frame.getByText('Cancellation policy',{exact:true}).first().waitFor();
   await prepareCheckoutButton(frame);
   const evidence=await frame.evaluate(()=>({
    login:Array.from(document.querySelectorAll('button')).some(e=>e.getBoundingClientRect().width>0 && e.textContent?.trim()==='Log in'),
    policies:[...new Set(Array.from(document.querySelectorAll('[role="dialog"]')).map(e=>e.textContent?.match(/Cancellation policy([\s\S]*?)(?:Qualifies for|About|$)/)?.[1]?.trim()).filter((s):s is string=>!!s))],
    text:Array.from(document.querySelectorAll('[role="dialog"]')).map(e=>e.textContent || '').join(' '),
   }));
   if(evidence.login || evidence.policies.length!==1)throw new BrowserHandoff('checkout_login_or_policy_missing');
   const date=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${slot.day}T12:00:00Z`));
   const [hour,minute]=slot.time.split(':').map(Number);
   const time=`${hour%12 || 12}:${String(minute).padStart(2,'0')} ${hour>=12?'PM':'AM'}`;
   if(!evidence.text.includes(slot.venue.name) || !evidence.text.includes(`${date} ${time}`) || !evidence.text.includes(`${slot.party} Guests, ${slot.seating}`))throw new BrowserHandoff('checkout_slot_mismatch');
   // Financial evidence is parsed locally; no account data or full HTML goes to a model/log.
   const raw=responses.findLast(r=>r.config===exact.configToken && !!(r.raw as {book_token?:unknown}).book_token)?.raw;
   const terms=readCheckoutTerms(raw,slot,evidence.policies[0],this.account());
   return {session,frame,slot:exact,terms,diagnose:async()=>{
    const button=frame!.getByRole('button',{name:'Reserve Now',exact:true});
    const geometry={button:await button.boundingBox(),frame:await (await frame!.frameElement()).boundingBox(),viewport:page.viewportSize()};
    const enabled=await button.isEnabled();let clickError:string|undefined,clickEvidence:string[]=[];
    try{await button.click();}catch(e){clickError=e instanceof Error?e.name:'unknown';if(e instanceof Error)clickEvidence=e.message.split('\n').filter(line=>/intercepts pointer|not stable|not visible|outside of the viewport|element is detached/.test(line)).slice(-5);}
    await page.waitForTimeout(5000);
    const ui=await frame!.evaluate(()=>({
     buttons:Array.from(document.querySelectorAll('button')).filter(e=>e.getBoundingClientRect().width>0).map(e=>e.textContent?.trim()).filter(s=>s && /reserve|confirm|continue|verify|payment|card|complete/i.test(s)),
     inputs:Array.from(document.querySelectorAll('input')).filter(e=>e.getBoundingClientRect().width>0).map(e=>({name:e.name,type:e.type,required:e.required})),
     paymentPrompt:/add (?:a )?(?:credit card|payment method)|enter (?:your )?card|card number/i.test(document.body.textContent || ''),
    }));
    return {enabled,geometry,clickError,clickEvidence,blocked,ui,bookingSubmitted:false};
   },submit:async(expires:number)=>{
    if(!terms.token)throw new BrowserHandoff('browser_booking_token_missing');
    gate=new SubmissionGate(terms.token,expires);
    const result=page.waitForResponse(r=>r.request()===submitted,{timeout:15000}).then(async r=>{
     if(!r.ok())throw new BookingError('browser_booking_response_failed',true);
     return bookingConfirmation(await r.json());
    });
    // Attach a rejection handler immediately, even if click itself fails.
    void result.catch(()=>undefined);
    gate.arm();
    try{await frame!.getByRole('button',{name:'Reserve Now',exact:true}).click();return await result;}
    catch(error){if(error instanceof BookingError)throw error;throw new BookingError(submitted?'browser_submission_unconfirmed':'browser_submission_not_observed',true);}
   }};
  }catch(error){await session.close();if(error instanceof BrowserHandoff)throw error;throw new BrowserHandoff(`checkout_${stage}_${error instanceof Error?error.name:'failed'}`);}
 }
 async submitApproved(slot:Slot,reviewedTerms:string,expires:number,beforeSubmit:(slot:Slot,details:Details)=>void){
  if(!this.enabled() || Date.now()>=expires)throw new BrowserHandoff('browser_booking_not_authorized');
  const account=this.account();
  const checkout=await this.open(slot);
  try{
   if(!this.enabled() || account!==this.account() || checkout.terms.terms!==reviewedTerms || checkout.terms.requiresPaymentSetup || Date.now()>=expires)
    throw new BrowserHandoff('approved_terms_or_account_changed');
   const details:Details={source:'browser',bookToken:randomUUID(),paymentId:null,terms:checkout.terms.terms,fingerprint:checkout.terms.fingerprint,expires:Math.min(expires,Date.now()+300000)};
   // The operator must durably write the approval/unknown attempt before the gate opens.
   beforeSubmit(checkout.slot,details);
   return await checkout.submit(Math.min(details.expires,checkout.terms.tokenExpires));
  }finally{await checkout.session.close();}
 }
 async diagnose(slot:Slot){
  const checkout=await this.open(slot);
  try{return await checkout.diagnose();}finally{await checkout.session.close();}
 }
 async details(slot:Slot):Promise<Details>{
  const account=this.account();
  const checkout=await this.open(slot);
  try {
   if(account!==this.account())throw new BrowserHandoff('browser_account_changed');
   const details:Details={source:'browser',bookToken:randomUUID(),paymentId:null,requiresPaymentSetup:checkout.terms.requiresPaymentSetup,expires:Date.now()+5*60000,terms:checkout.terms.terms,fingerprint:checkout.terms.fingerprint};
   for(const [id,t] of this.tickets)if(t.details.expires<=Date.now())this.tickets.delete(id);
   if(this.tickets.size>=100)this.tickets.delete(this.tickets.keys().next().value!);
   this.tickets.set(details.bookToken,{slot:structuredClone(slot),details:{...details},account});return details;
  }finally{await checkout.session.close();}
 }
 async book(details:Details,authorizationExpires=details.expires){
  const ticket=this.tickets.get(details.bookToken);this.tickets.delete(details.bookToken);
  if(!this.enabled() || !ticket || details.source!=='browser' || details.expires<=Date.now() || ticket.account!==this.account() || fingerprint(ticket.details)!==fingerprint(details))throw new BrowserHandoff('browser_booking_not_authorized');
  let checkout:Awaited<ReturnType<BrowserCheckout['open']>>;
  try{checkout=await this.open(ticket.slot);}catch(error){throw new BrowserPreflightError(error instanceof BrowserHandoff?error.reason:'failed');}
  try {
   if(checkout.terms.requiresPaymentSetup)throw new BrowserHandoff('browser_payment_method_required');
   if(Date.now()>=authorizationExpires || !this.enabled() || ticket.account!==this.account() || checkout.terms.fingerprint!==details.fingerprint || details.expires<=Date.now())throw new BrowserHandoff('browser_terms_or_account_changed');
   return await checkout.submit(Math.min(details.expires,authorizationExpires,checkout.terms.tokenExpires));
  }finally{await checkout.session.close();}
 }
}
