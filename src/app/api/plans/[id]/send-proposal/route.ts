import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hangoutPlans, proposals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getPlanWithParticipants } from "@/lib/plans/service";
import { sendProposalEmail } from "@/lib/google/gmail";
import { z } from "zod";

const sendSchema = z.object({
  emailSubject: z.string().min(1),
  emailBody: z.string().min(1),
  selectedSlots: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
    })
  ),
  activities: z.array(z.record(z.string(), z.unknown())),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const data = await getPlanWithParticipants(id);
  if (!data) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  if (data.plan.organizerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const recipients = data.participants.map((p) => p.email);

  try {
    await sendProposalEmail(
      session.user.id,
      recipients,
      parsed.data.emailSubject,
      parsed.data.emailBody,
      id,
      appUrl
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const db = getDb();
  await db.insert(proposals).values({
    id: uuidv4(),
    planId: id,
    selectedSlotsJson: JSON.stringify(parsed.data.selectedSlots),
    activitiesJson: JSON.stringify(parsed.data.activities),
    emailSubject: parsed.data.emailSubject,
    emailBody: parsed.data.emailBody,
    sentAt: new Date(),
  });

  await db
    .update(hangoutPlans)
    .set({ status: "sent" })
    .where(eq(hangoutPlans.id, id));

  return NextResponse.json({ success: true });
}
