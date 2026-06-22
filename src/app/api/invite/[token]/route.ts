import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { participants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyInviteToken } from "@/lib/invite";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const session = await auth();
  const { token } = await params;

  let participantId: string;
  let planId: string;

  try {
    ({ participantId, planId } = await verifyInviteToken(token));
  } catch {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
  }

  if (!session?.user?.id) {
    const callbackUrl = `/invite/${token}`;
    return NextResponse.json({
      needsAuth: true,
      signInUrl: `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    });
  }

  const db = getDb();
  const participant = await db.query.participants.findFirst({
    where: eq(participants.id, participantId),
  });

  if (!participant || participant.planId !== planId) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  await db
    .update(participants)
    .set({
      userId: session.user.id,
      status: "connected",
    })
    .where(eq(participants.id, participantId));

  return NextResponse.json({ success: true, planId });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const { planId } = await verifyInviteToken(token);
    return NextResponse.json({ planId, token });
  } catch {
    return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
  }
}
