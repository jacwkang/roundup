import { expect, it, vi } from 'vitest';
import { bookingConfirmation, readCheckoutTerms, SubmissionGate } from './checkout';
import type { Slot } from '../types';
import { FallbackProvider } from '../fallback';
const slot:Slot={id:'s',venue:{id:1,name:'Test',locality:'New York',timeZone:'America/New_York',source:'browser',url:'https://resy.com/cities/new-york-ny/venues/test'},day:'2099-09-27',time:'09:00',party:2,seating:'Indoor',configToken:'slot'};
const policy='A cancellation fee will not be charged if you cancel before Sat, Sep. 26 at 12:00pm.\nIf you cancel after that, you agree to be charged a fee of $30.00 + tax per guest on the reservation. Any waiver of the fee is at the sole discretion of the restaurant.';
function fixture(){
 const amounts={price_per_unit:0,resy_fee:0,service_fee:0,service_charge:{amount:0,value:'0%'},tax:0,total:0};
 return {payment:{amounts:{...amounts,items:[],reservation_charge:0,subtotal:0,add_ons:0,quantity:2,surcharge:0},comp:false,config:{type:'free'},display:{balance:{value:'',modifier:''},buy:{action:'NOW',after_modifier:'',before_modifier:'',init:'',value:'RESERVE'},description:[]},options:[{amounts}]},cancellation:{credit:{date_cut_off:null},display:{policy:[policy]},fee:{amount:30,tax:null,display:{amount:'$30.00'},date_cut_off:'2099-09-26T16:00:00Z'},refund:{date_cut_off:'2099-09-26T16:00:00Z'}},change:{date_cut_off:'2099-09-26T16:00:00Z'},user:{payment_methods:[{id:1}]},config:{is_event:false},book_token:{value:'private',date_expires:'2099-09-25T17:00:00Z'}};
}
it('quotes the observed zero-upfront, conditional-fee contract with party total',()=>{
 const result=readCheckoutTerms(fixture(),slot,policy,'account');
 expect(result.terms).toContain('No upfront payment');expect(result.terms).toContain('$60.00 plus tax total');expect(result.terms).toContain('America/New_York');
 expect(result.terms).not.toContain('private');
 expect(readCheckoutTerms({...fixture(),user:{payment_methods:null}},slot,policy,'account').requiresPaymentSetup).toBe(true);
});
it('rejects changed, missing, prepaid or unfamiliar financial fields',()=>{
 const raw=fixture();
 expect(()=>readCheckoutTerms({...raw,payment:{...raw.payment,deposit:1}},slot,policy,'a')).toThrow();
 expect(()=>readCheckoutTerms({...raw,payment:{...raw.payment,amounts:{...raw.payment.amounts,total:5}}},slot,policy,'a')).toThrow();
 expect(()=>readCheckoutTerms({...raw,change:{date_cut_off:null}},slot,policy,'a')).toThrow();
 expect(()=>readCheckoutTerms({...raw,config:{is_event:true}},slot,policy,'a')).toThrow();
 expect(()=>readCheckoutTerms(raw,{...slot,party:4},policy,'a')).toThrow();
 expect(()=>readCheckoutTerms(raw,slot,policy.replace('$30','$35'),'a')).toThrow();
 expect(()=>readCheckoutTerms({},slot,policy,'a')).toThrow();
});
it('fingerprints account, payment method, exact slot, and policy',()=>{
 const raw=fixture(),original=readCheckoutTerms(raw,slot,policy,'a').fingerprint;
 expect(readCheckoutTerms(raw,slot,policy,'b').fingerprint).not.toBe(original);
 expect(readCheckoutTerms({...raw,user:{payment_methods:[{id:2}]}},slot,policy,'a').fingerprint).not.toBe(original);
 expect(readCheckoutTerms(raw,{...slot,time:'10:00'},policy,'a').fingerprint).not.toBe(original);
});
it('allows exactly one armed matching booking POST; blocks expiration and replay',()=>{
 const gate=new SubmissionGate('secret',Date.now()+10000);
 const args=['POST','https://api.resy.com/3/book','book_token=secret','https://widgets.resy.com'] as const;
 expect(gate.accept(...args)).toBe(false);gate.arm();
 expect(gate.accept('POST',args[1],'book_token=other',args[3])).toBe(false);
 expect(gate.accept('POST',args[1],'book_token=secret&book_token=secret',args[3])).toBe(false);
 expect(gate.accept('POST','https://evil.example/3/book',args[2],args[3])).toBe(false);
 expect(gate.accept('POST',args[1],args[2],'https://resy.com')).toBe(false);
 expect(gate.accept(...args)).toBe(true);expect(gate.accept(...args)).toBe(false);
 const json=new SubmissionGate('secret',Date.now()+10000);json.arm();expect(json.accept('POST',args[1],JSON.stringify({book_token:'secret'}),args[3])).toBe(true);
 const expired=new SubmissionGate('secret',Date.now()-1);expired.arm();expect(expired.accept(...args)).toBe(false);
});
it('requires a provider confirmation, never click success or an empty HTTP 200',()=>{
 for(const raw of [{},{success:true},{reservation_id:''},{error:'declined'}])expect(()=>bookingConfirmation(raw)).toThrow();
 expect(bookingConfirmation({reservation_id:123})).toMatchObject({reference:'123'});
 expect(bookingConfirmation({resy_token:'private'})).toEqual({reference:null,managementToken:'private'});
});
it('routes browser mutation by provenance and never retries via API',async()=>{
 const provider=()=>({search:vi.fn(),slots:vi.fn(),details:vi.fn(),book:vi.fn(),reservations:vi.fn()});
 const api=provider(),browser=provider(),fallback=new FallbackProvider(api,browser);
 const details={source:'browser' as const,bookToken:'ticket',expires:99,terms:'terms',fingerprint:'f',paymentId:null};
 browser.book.mockRejectedValue(new Error('uncertain'));
 await expect(fallback.book(details,88)).rejects.toThrow();expect(api.book).not.toHaveBeenCalled();expect(browser.book).toHaveBeenCalledExactlyOnceWith(details,88);
});

it('consumes browser tickets once and rechecks terms before submission',async()=>{
 const {BrowserCheckout}=await import('./checkout');
 const submit=vi.fn().mockResolvedValue({reference:'confirmed'}),close=vi.fn();
 const view={session:{close},terms:{terms:'policy',fingerprint:'same',tokenExpires:Date.now()+60000},submit};
 const checkout=new BrowserCheckout({} as never,()=> 'account',()=>true);
 const open=vi.spyOn(checkout as unknown as {open:()=>Promise<typeof view>},'open').mockResolvedValue(view);
 const details=await checkout.details(slot);
 await expect(checkout.book(details,Date.now()+10000)).resolves.toEqual({reference:'confirmed'});
 await expect(checkout.book(details)).rejects.toThrow();expect(submit).toHaveBeenCalledTimes(1);expect(open).toHaveBeenCalledTimes(2);expect(close).toHaveBeenCalledTimes(2);
 const next=await checkout.details(slot);open.mockResolvedValue({...view,terms:{...view.terms,fingerprint:'changed'}});
 await expect(checkout.book(next)).rejects.toThrow();expect(submit).toHaveBeenCalledTimes(1);
});
it('blocks expired approvals, changed account, disabled booking and tampered tickets',async()=>{
 const {BrowserCheckout}=await import('./checkout');let account='one',enabled=true;
 const submit=vi.fn(),view={session:{close:vi.fn()},terms:{terms:'policy',fingerprint:'same',tokenExpires:Date.now()+60000},submit};
 const checkout=new BrowserCheckout({} as never,()=>account,()=>enabled);
 vi.spyOn(checkout as unknown as {open:()=>Promise<typeof view>},'open').mockResolvedValue(view);
 const expired=await checkout.details(slot);await expect(checkout.book(expired,Date.now()-1)).rejects.toThrow();
 const changed=await checkout.details(slot);account='two';await expect(checkout.book(changed)).rejects.toThrow();
 const disabled=await checkout.details(slot);enabled=false;await expect(checkout.book(disabled)).rejects.toThrow();
 enabled=true;const tampered=await checkout.details(slot);tampered.expires+=60000;await expect(checkout.book(tampered)).rejects.toThrow();
 expect(submit).not.toHaveBeenCalled();
});

 it('supports the observed Mira no-charge policy without treating a missing fee as free by itself',()=>{
 const raw=fixture(),noFeePolicy="While you won't be charged if you need to cancel, we ask that you do so at least 24 hours in advance.";
 const mira={...raw,cancellation:{...raw.cancellation,fee:null,display:{policy:[noFeePolicy]},refund:{date_cut_off:'2099-09-27T13:00:00Z'}},change:{date_cut_off:'2099-09-27T13:00:00Z'}};
 expect(readCheckoutTerms(mira,slot,noFeePolicy,'account').terms).toContain('no cancellation charge');
 expect(()=>readCheckoutTerms({...mira,cancellation:{...mira.cancellation,display:{policy:['Unknown policy']}}},slot,'Unknown policy','account')).toThrow();
 expect(()=>readCheckoutTerms(mira,{...slot,time:'10:00'},noFeePolicy,'account')).toThrow();
 });

it('positions the outer iframe and verifies actionability without submitting',async()=>{
 const {prepareCheckoutButton}=await import('./checkout');
 const evaluate=vi.fn(),button={scrollIntoViewIfNeeded:vi.fn(),click:vi.fn()};
 const frame={frameElement:async()=>({evaluate}),getByRole:()=>button};
 await prepareCheckoutButton(frame as never);
 expect(evaluate).toHaveBeenCalledTimes(1);expect(button.scrollIntoViewIfNeeded).toHaveBeenCalledTimes(1);
 expect(button.click).toHaveBeenCalledExactlyOnceWith({trial:true,timeout:1200});
});

it('classifies checkout preparation failures before any submission separately from unknown outcomes',async()=>{
 const {BrowserCheckout,BrowserPreflightError}=await import('./checkout');
 const view={session:{close:vi.fn()},terms:{terms:'policy',fingerprint:'same',tokenExpires:Date.now()+60000},submit:vi.fn()};
 const checkout=new BrowserCheckout({} as never,()=> 'account',()=>true);
 const open=vi.spyOn(checkout as unknown as {open:()=>Promise<typeof view>},'open').mockResolvedValue(view);
 const details=await checkout.details(slot);open.mockRejectedValue(new Error('timeout preparing the page'));
 await expect(checkout.book(details)).rejects.toBeInstanceOf(BrowserPreflightError);expect(view.submit).not.toHaveBeenCalled();
});

it('retries only read-only positioning checks when the iframe layout shifts',async()=>{
 const {prepareCheckoutButton}=await import('./checkout');
 const timeout=new Error('moving layout');timeout.name='TimeoutError';
 const button={scrollIntoViewIfNeeded:vi.fn(),click:vi.fn().mockRejectedValueOnce(timeout).mockResolvedValue(undefined)};
 const waitForTimeout=vi.fn(),evaluate=vi.fn();
 await prepareCheckoutButton({frameElement:async()=>({evaluate}),getByRole:()=>button,page:()=>({waitForTimeout})} as never);
 expect(button.click).toHaveBeenCalledTimes(2);expect(evaluate).toHaveBeenCalledTimes(2);
 for(const call of button.click.mock.calls)expect(call[0]).toEqual({trial:true,timeout:1200});
});

it('uses one prepared checkout and writes the operator attempt before enabling submission',async()=>{
 const {BrowserCheckout}=await import('./checkout');const order:string[]=[];
 const view={slot,session:{close:vi.fn()},terms:{terms:'reviewed',fingerprint:'same',tokenExpires:Date.now()+60000},submit:vi.fn().mockImplementation(async()=>{order.push('submit');return {reference:'R1'};})};
 const checkout=new BrowserCheckout({} as never,()=> 'account',()=>true);
 const open=vi.spyOn(checkout as unknown as {open:()=>Promise<typeof view>},'open').mockResolvedValue(view);
 await expect(checkout.submitApproved(slot,'reviewed',Date.now()+30000,()=>{order.push('durable');})).resolves.toEqual({reference:'R1'});
 expect(order).toEqual(['durable','submit']);expect(open).toHaveBeenCalledTimes(1);expect(view.session.close).toHaveBeenCalledTimes(1);
 const before=vi.fn();await expect(checkout.submitApproved(slot,'changed',Date.now()+30000,before)).rejects.toThrow();expect(before).not.toHaveBeenCalled();
 await expect(checkout.submitApproved(slot,'reviewed',Date.now()+30000,()=>{throw new Error('database write failed');})).rejects.toThrow();expect(view.submit).toHaveBeenCalledTimes(1);
});
