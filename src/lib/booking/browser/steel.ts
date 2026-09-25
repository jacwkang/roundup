import Steel from 'steel-sdk';
import type { SessionCreateParams } from 'steel-sdk/resources/sessions/sessions';
import type { Fetch } from 'steel-sdk/core';
import { chromium, type Browser, type Page } from 'playwright';
import type { Store } from '../../messaging/store';
import type { Vault } from '../vault';
import { BrowserHandoff, safeURL } from './policy';

export type RemoteSession = { id: string; viewer: string; page: Page; close: () => Promise<void>; save: () => Promise<void> };
export class BrowserState {
  constructor(private store: Store, private vault: Vault, private owner: string) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS browser_state (owner TEXT PRIMARY KEY, ciphertext TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS browser_budget (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0);`);
  }
  read(): SessionCreateParams['sessionContext'] | undefined {
    const row = this.store.db.prepare('SELECT ciphertext FROM browser_state WHERE owner=?').get(this.owner) as { ciphertext: string } | undefined;
    return row ? JSON.parse(this.vault.open(row.ciphertext, `steel:${this.owner}`)) : undefined;
  }
  write(data: unknown) { this.store.db.prepare('INSERT OR REPLACE INTO browser_state VALUES (?,?)').run(this.owner, this.vault.seal(JSON.stringify(data), `steel:${this.owner}`)); }
  clear() { this.store.db.prepare('DELETE FROM browser_state WHERE owner=?').run(this.owner); }
  spend(limit: number) {
    return this.store.db.transaction(() => {
      const day = new Date().toISOString().slice(0,10);
      this.store.db.prepare('INSERT OR IGNORE INTO browser_budget(day) VALUES (?)').run(day);
      return this.store.db.prepare('UPDATE browser_budget SET calls=calls+1 WHERE day=? AND calls<?').run(day, limit).changes > 0;
    }).immediate();
  }
}
export class SteelBrowser {
  constructor(private key: string | undefined, private state: BrowserState,
    // Steel's SDK types target node-fetch; Node 22+ provides the compatible native Fetch API.
    private clientFactory = (key: string) => new Steel({ steelAPIKey: key, maxRetries: 0, timeout: 20000, fetch: globalThis.fetch as unknown as Fetch }),
    private connect = chromium.connectOverCDP.bind(chromium)) {}
  async open(manual = false): Promise<RemoteSession> {
    if (!this.key) throw new BrowserHandoff('steel_key_missing');
    const client = this.clientFactory(this.key);
    let session: Awaited<ReturnType<typeof client.sessions.create>> | undefined;
    let browser: Browser | undefined;
    try {
      session = await client.sessions.create({ timeout: manual ? 300000 : 90000, solveCaptcha: false, useProxy: false,
        persistProfile: false, dimensions: { width: 1100, height: 800 }, sessionContext: this.state.read() });
      const cdp = new URL(session.websocketUrl);
      if (cdp.protocol !== 'wss:' || !(cdp.hostname === 'steel.dev' || cdp.hostname.endsWith('.steel.dev'))) throw new BrowserHandoff('invalid_steel_endpoint');
      cdp.searchParams.set('apiKey', this.key);
      browser = await this.connect(cdp.toString(), { timeout: 20000 });
      const context = browser.contexts()[0];
      if (!context) throw new BrowserHandoff('missing_browser_context');
      if (!manual) await context.route('**/*', async route => {
        const req = route.request(); const url = new URL(req.url());
        // Never allow reservation/account mutations during discovery, including accidental UI requests.
        if (/\/(?:book|cancel|reservations?\/create)(?:\/|$)/i.test(url.pathname)) return route.abort();
        if (req.isNavigationRequest() && req.frame() === req.frame().page().mainFrame()) {
          try { safeURL(req.url()); } catch { return route.abort(); }
        }
        await route.continue();
      });
      const page = context.pages()[0] ?? await context.newPage();
      page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(20000);
      let closed = false;
      const id = session.id;
      return { id, viewer: session.sessionViewerUrl, page,
        save: async () => { this.state.write(await client.sessions.context(id)); },
        close: async () => {
          if (closed) return; closed = true;
          // Cloud teardown can take longer than an ordinary API call. Release before
          // disconnecting CDP and allow teardown its own bounded timeout.
          try { await client.sessions.release(id, {}, { timeout: 60000 }); }
          catch (error) {
            const status = error instanceof Steel.APIError ? error.status : undefined;
            const kind = error instanceof Error && /^[A-Za-z]+Error$/.test(error.name) ? error.name : "network";
            throw new BrowserHandoff(`steel_release_failed_${status ?? kind}`);
          } finally { await browser?.close().catch(() => undefined); }
        } };
    } catch {
      if (session) await client.sessions.release(session.id, {}, { timeout: 60000 }).catch(() => undefined);
      try { await browser?.close(); } catch { /* provider TTL remains the backstop */ }
      // SDK/CDP errors can contain URLs with credentials: never propagate raw errors.
      throw new BrowserHandoff('steel_connection_failed');
    }
  }
}
