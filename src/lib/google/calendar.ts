import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { decryptToken } from "@/lib/crypto/tokens";

export async function getGoogleClient(userId: string) {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user?.encryptedRefreshToken) {
    throw new Error("User has not connected Google Calendar");
  }

  const refreshToken = decryptToken(user.encryptedRefreshToken);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return { oauth2Client, calendarId: user.calendarId ?? "primary" };
}

export async function queryFreeBusy(
  userIds: string[],
  timeMin: Date,
  timeMax: Date
): Promise<Record<string, { busy: { start: string; end: string }[] }>> {
  const result: Record<string, { busy: { start: string; end: string }[] }> = {};

  for (const userId of userIds) {
    const { oauth2Client, calendarId } = await getGoogleClient(userId);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: calendarId }],
      },
    });

    const calData = response.data.calendars?.[calendarId];
    result[userId] = {
      busy: (calData?.busy ?? []).map((b) => ({
        start: b.start!,
        end: b.end!,
      })),
    };
  }

  return result;
}

export async function getCalendarBusyBlocks(
  userId: string,
  timeMin: Date,
  timeMax: Date
) {
  const freeBusy = await queryFreeBusy([userId], timeMin, timeMax);
  return freeBusy[userId]?.busy ?? [];
}
