import { z } from 'zod';
const schema = z.object({
  STEEL_API_KEY: z.string().optional(),
  ARA_BROWSER_ENABLED: z.enum(['true','false']).default('false'),
  ARA_RESY_CITY_SLUG: z.string().regex(/^[a-z0-9-]+$/).default('new-york-ny'),
  ARA_BROWSER_DOM_LLM: z.enum(['true','false']).default('true'),
  ARA_BROWSER_SCREENSHOTS: z.enum(['true','false']).default('false'),
  ARA_BROWSER_DAILY_MODEL_CALLS: z.coerce.number().int().min(0).max(100).default(10),
});
export type BrowserConfig = z.infer<typeof schema>;
export function readBrowserConfig(env: Record<string,string|undefined> = process.env): BrowserConfig { return schema.parse(env); }
