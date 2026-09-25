import { afterEach, expect, it, vi } from 'vitest';
import Steel from 'steel-sdk';
import type { Browser } from 'playwright';
import { Store } from '../../messaging/store';
import { Vault } from '../vault';
import { BookingError, type ReservationProvider } from '../types';
import { FallbackProvider } from '../fallback';
import { BrowserHandoff, checkPage, ladder, redact, safeURL, venueURL } from './policy';
import { BrowserState, SteelBrowser } from './steel';
import { selectorModel } from './model';
const stores:Store[]=[];
afterEach(()=>stores.splice(0).forEach(s=>s.close()));
function state() { const store=new Store(':memory:');stores.push(store);return new BrowserState(store,new Vault(store.db,'ab'.repeat(32)),'owner'); }
function provider() { return {search:vi.fn().mockResolvedValue([]),slots:vi.fn().mockResolvedValue([]),details:vi.fn(),book:vi.fn(),reservations:vi.fn().mockResolvedValue([])}; }
it('successful API results, including zero results, never open a browser',async()=>{
 const api=provider(), browser=provider(); const fallback=new FallbackProvider(api,browser);
 expect(await fallback.search('dinner')).toEqual([]);expect(browser.search).not.toHaveBeenCalled();
});
it('falls back on a denied read but never on a mutation or uncertain result',async()=>{
 const api=provider(),browser=provider(); const fallback=new FallbackProvider(api,browser);
 api.search.mockRejectedValue(new BookingError('resy_access_denied')); await fallback.search('dinner'); expect(browser.search).toHaveBeenCalledTimes(1);
 api.search.mockRejectedValue(new BookingError('resy_unreachable',true)); await expect(fallback.search('dinner')).rejects.toThrow();expect(browser.search).toHaveBeenCalledTimes(1);
 api.book.mockRejectedValue(new BookingError('resy_http_503',true));await expect(fallback.book({bookToken:'secret',expires:0,terms:'',fingerprint:'',paymentId:null})).rejects.toThrow();expect(browser.book).not.toHaveBeenCalled();
});
it('does not escalate expired authentication or invalid arguments',async()=>{
 const api=provider(),browser=provider();const fallback=new FallbackProvider(api,browser);
 api.search.mockRejectedValue(new BookingError('resy_auth_expired'));await expect(fallback.search('hi')).rejects.toThrow();expect(browser.search).not.toHaveBeenCalled();
 expect(()=>fallback.search('')).toThrow();
});
it('routes browser venue IDs to the browser, never the numeric-ID API',async()=>{
 const api=provider(),browser=provider();const fallback=new FallbackProvider(api,browser);
 await fallback.slots({id:23,name:'X',locality:'NY',timeZone:'America/New_York',source:'browser'},'2099-01-01',2);
 expect(api.slots).not.toHaveBeenCalled();expect(browser.slots).toHaveBeenCalledTimes(1);
});
it('uses stages in order and stops before expensive stages on success',async()=>{
 const visited:string[]=[];const result=await ladder([{stage:'playwright',run:async()=>undefined},{stage:'dom',run:async()=>[]},{stage:'dom_llm',run:async()=>['bad']}],s=>visited.push(s));
 expect(result).toEqual([]);expect(visited).toEqual(['playwright','dom']);
});
it('hands off after bounded unsuccessful stages',async()=>{
 const visited:string[]=[];await expect(ladder([{stage:'dom',run:async()=>undefined},{stage:'dom_llm',run:async()=>undefined},{stage:'screenshot',run:async()=>undefined}],s=>visited.push(s))).rejects.toBeInstanceOf(BrowserHandoff);
 expect(visited).toEqual(['dom','dom_llm','screenshot','human']);
});
it('allows only Resy discovery URLs and strips unexpected query parameters',()=>{
 expect(safeURL('https://resy.com/cities/new-york-ny/search?query=dinner&token=secret')).not.toContain('secret');
 for(const url of ['http://resy.com/','https://evil.example/','https://resy.com.evil.example/','https://resy.com/account','https://resy.com/checkout','https://user@resy.com/','https://resy.com:444/'])expect(()=>safeURL(url)).toThrow();
 expect(venueURL('/cities/new-york-ny/venues/test?date=2099-01-01')).toBe('https://resy.com/cities/new-york-ny/venues/test');
 expect(venueURL('/cities/new-york-ny/search')).toBeUndefined();
});
it('stops at challenges, login verification and checkout instead of escalating',()=>{
 for(const text of ['Verify you are human','Enter your password','Enter verification code','Confirm your reservation','Payment details'])expect(()=>checkPage(text)).toThrow(BrowserHandoff);
 expect(redact('owner@example.com +1 212 555 1234')).not.toContain('owner@example.com');
});
it('encrypts cloud browser context and shares a durable daily model budget',()=>{
 const s=state();s.write({cookies:[{name:'auth',value:'private-cookie'}]});expect(JSON.stringify(s.read())).toContain('private-cookie');
 expect(s.spend(2)).toBe(true);expect(s.spend(2)).toBe(true);expect(s.spend(2)).toBe(false);s.clear();expect(s.read()).toBeUndefined();
});
it('releases a Steel session when CDP fails and does not leak the credential URL',async()=>{
 const release=vi.fn().mockResolvedValue({});const client={sessions:{create:vi.fn().mockResolvedValue({id:'session',websocketUrl:'wss://connect.steel.dev?sessionId=session'}),release}};
 const remote=new SteelBrowser('private-key',state(),()=>client as unknown as Steel,vi.fn().mockRejectedValue(new Error('wss://host?apiKey=private-key')));
 await expect(remote.open()).rejects.toMatchObject({reason:'steel_connection_failed'});expect(release).toHaveBeenCalledWith('session',{}, {timeout:60000});
});
it('cloud sessions have bounded life, reuse encrypted context, and release once',async()=>{
 const s=state();s.write({cookies:[]});const release=vi.fn().mockResolvedValue({});
 const create=vi.fn().mockResolvedValue({id:'session',websocketUrl:'wss://connect.steel.dev?sessionId=session',sessionViewerUrl:'https://app.steel.dev/sessions/session'});
 const client={sessions:{create,release,context:vi.fn().mockResolvedValue({cookies:[]})}};
 const page={setDefaultTimeout:vi.fn(),setDefaultNavigationTimeout:vi.fn()};const context={pages:()=>[page],route:vi.fn()};const browser={contexts:()=>[context],close:vi.fn().mockResolvedValue(undefined)};
 const remote=new SteelBrowser('key',s,()=>client as unknown as Steel,vi.fn().mockResolvedValue(browser as unknown as Browser));
 const session=await remote.open();await session.close();await session.close();expect(release).toHaveBeenCalledTimes(1);
 expect(create.mock.calls[0][0]).toMatchObject({timeout:90000,solveCaptcha:false,useProxy:false,persistProfile:false,sessionContext:{cookies:[]}});
});
it('rejects model-invented candidate IDs and prevents calls over the daily budget',async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json({output:[{type:'message',content:[{type:'output_text',text:'{"ids":[0,999]}'}]}]}));
 const select=selectorModel('private-key','model',state(),1,fetcher);
 const snapshot={url:'https://resy.com/',text:'public restaurants',candidates:[{id:0,name:'Test',url:'https://resy.com/cities/ny/venues/test'}],searchValue:'',selectedDay:'',selectedParty:''};
 expect(await select('dinner',snapshot)).toEqual([0]);await expect(select('dinner',snapshot)).rejects.toMatchObject({reason:'model_budget_exhausted'});expect(fetcher).toHaveBeenCalledTimes(1);
});
// Keep this compile-time assertion: all fallback adapters must satisfy the same provider boundary.
const _contract: ReservationProvider = provider(); void _contract;
