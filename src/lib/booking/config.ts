import { z } from "zod";

const schema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  ARA_BOOKING_OWNER: z.string().regex(/^\+[1-9]\d{7,14}$/),
  ARA_PILOT_CITY: z.string().min(1),
  ARA_ALLOWED_LOCALITIES: z.string().optional(),
  ARA_TIME_ZONE: z.string().refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }),
  ARA_LATITUDE: z.string().min(1).transform(Number).pipe(z.number().min(-90).max(90)),
  ARA_LONGITUDE: z.string().min(1).transform(Number).pipe(z.number().min(-180).max(180)),
  ARA_CREDENTIAL_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  RESY_API_KEY: z.string().min(1),
});
export type BookingConfig = z.infer<typeof schema> & { enabled: boolean; bookingsEnabled: boolean };
export function readBookingConfig(env: Record<string, string | undefined> = process.env): BookingConfig | undefined {
  if (env.ARA_AI_ENABLED !== "true") return undefined;
  const result = schema.safeParse(env);
  if (!result.success) throw new Error(`Invalid M2 configuration: ${result.error.issues.map(i => i.path.join(".")).join(", ")}`);
  return { ...result.data, enabled: true, bookingsEnabled: env.ARA_BOOKINGS_ENABLED === "true" };
}
