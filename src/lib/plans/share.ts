import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hangoutPlans } from "@/lib/db/schema";

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function getJoinUrl(shareToken: string): string {
  return `${getAppUrl()}/join/${shareToken}`;
}

export async function getPlanByShareToken(shareToken: string) {
  const db = getDb();
  return db.query.hangoutPlans.findFirst({
    where: eq(hangoutPlans.shareToken, shareToken),
  });
}

export function getCoordinatorUrl(planId: string): string {
  return `${getAppUrl()}/plans/${planId}/coordinate`;
}
