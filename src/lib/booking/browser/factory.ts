import type { Store } from '../../messaging/store';
import type { BookingConfig } from '../config';
import { Vault } from '../vault';
import { Resy } from '../resy';
import { FallbackProvider } from '../fallback';
import { readBrowserConfig } from './config';
import { BrowserState, SteelBrowser } from './steel';
import { BrowserProvider } from './provider';
import { BrowserCheckout } from './checkout';
import { fingerprint } from '../resy';
import { BrowserHandoff } from './policy';
import { selectorModel } from './model';
export function browserServices(store: Store, config: BookingConfig) {
  const settings = readBrowserConfig();
  const state = new BrowserState(store, new Vault(store.db, config.ARA_CREDENTIAL_KEY), config.ARA_BOOKING_OWNER);
  const remote = new SteelBrowser(settings.STEEL_API_KEY, state);
  const checkout = new BrowserCheckout(remote,()=>{const context=state.read();if(!context)throw new BrowserHandoff('login_context_missing');return fingerprint(context);},()=>config.bookingsEnabled);
  const provider = new BrowserProvider(remote, config, settings, selectorModel(config.OPENAI_API_KEY,config.OPENAI_MODEL,state,settings.ARA_BROWSER_DAILY_MODEL_CALLS),undefined,checkout);
  return { settings, state, remote, provider, checkout };
}
export function reservationProvider(store: Store, config: BookingConfig, vault: Vault) {
  const api = new Resy(config, () => vault.token(config.ARA_BOOKING_OWNER));
  if (readBrowserConfig().ARA_BROWSER_ENABLED !== 'true') return api;
  return new FallbackProvider(api,browserServices(store,config).provider);
}
