import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hangoutPlans, participants, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { createInviteToken } from "@/lib/invite";
import { sendInviteEmail } from "@/lib/google/gmail";
import { z } from "zod";

const createPlanSchema = z.object({
  title: z.string().min(1),
  city: z.string().min(1),
  timezone: z.string().default("America/New_York"),
  dateRangeStart: z.string(),
  dateRangeEnd: z.string(),
  minDurationMinutes: z.number().min(30).default(120),
  inviteEmails: z.array(z.string().email()).min(1),
  preferences: z
    .object({
      tags: z.array(z.string()).optional(),
      notes: z.string().optional(),
      eveningOnly: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const db = getDb();
  const planId = uuidv4();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const organizer = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  await db.insert(hangoutPlans).values({
    id: planId,
    organizerId: session.user.id,
    title: data.title,
    city: data.city,
    timezone: data.timezone,
    dateRangeStart: new Date(data.dateRangeStart),
    dateRangeEnd: new Date(data.dateRangeEnd),
    minDurationMinutes: data.minDurationMinutes,
    preferencesJson: JSON.stringify(data.preferences ?? {}),
    status: "collecting",
  });

  const createdParticipants = [];

  for (const email of data.inviteEmails) {
    const participantId = uuidv4();
    const inviteToken = await createInviteToken(participantId, planId);

    await db.insert(participants).values({
      id: participantId,
      planId,
      email: email.toLowerCase(),
      inviteToken,
      status: "invited",
    });

    const inviteUrl = `${appUrl}/invite/${inviteToken}`;

    try {
      await sendInviteEmail(
        session.user.id,
        organizer?.name ?? "Someone",
        email,
        data.title,
        inviteUrl
      );
    } catch (err) {
      console.error(`Failed to send invite to ${email}:`, err);
    }

    createdParticipants.push({ id: participantId, email, inviteUrl });
  }

  return NextResponse.json({
    planId,
    participants: createdParticipants,
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const plans = await db.query.hangoutPlans.findMany({
    where: eq(hangoutPlans.organizerId, session.user.id),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });

  return NextResponse.json({ plans });
}
