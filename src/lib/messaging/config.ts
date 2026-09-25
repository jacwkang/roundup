import { z } from "zod";

const schema = z.object({
  SENDBLUE_API_KEY: z.string().trim().min(1),
  SENDBLUE_API_SECRET: z.string().trim().min(1),
  SENDBLUE_WEBHOOK_SECRET: z.string().trim().min(32),
  SENDBLUE_PHONE_NUMBER: z.string().regex(/^\+[1-9]\d{7,14}$/),
  SENDBLUE_ALLOWED_GROUP_IDS: z.string().default(""),
  ARA_DATABASE_PATH: z.string().min(1).default("./data/ara-sendblue.db"),
});

export function readConfig(env: Record<string, string | undefined> = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.issues.map(i => i.path.join(".")).join(", ")}`);
  }
  const value = result.data;
  // Sendblue group IDs are opaque strings, not necessarily UUIDs.
  const allowedChatIds = value.SENDBLUE_ALLOWED_GROUP_IDS.split(",").map(s => s.trim()).filter(Boolean);
  return {
    apiKey: value.SENDBLUE_API_KEY,
    apiSecret: value.SENDBLUE_API_SECRET,
    webhookSecret: value.SENDBLUE_WEBHOOK_SECRET,
    phoneNumber: value.SENDBLUE_PHONE_NUMBER,
    allowedChatIds,
    databasePath: value.ARA_DATABASE_PATH,
  };
}
export type Config = ReturnType<typeof readConfig>;
