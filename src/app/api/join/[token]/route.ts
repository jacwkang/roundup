import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { participants } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getPlanByShareToken } from "@/lib/plans/share";
import { getPlanWithParticipants } from "@/lib/plans/service";
import { getResultsWithVotes } from "@/lib/plans/results";
import { z } from "zod";

const joinSchema = z.object({
  preferences: z.string().max(2000).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const plan = await getPlanByShareToken(token);

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const data = await getPlanWithParticipants(plan.id);
  if (!data) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const session = await auth();
  let myParticipant = null;
  if (session?.user?.id) {
    myParticipant = data.participants.find((p) => p.userId === session.user.id) ?? null;
  }

  const results =
    session?.user?.id && plan.status === "voting"
      ? await getResultsWithVotes(plan.id, session.user.id)
      : null;

  return NextResponse.json({
    plan: {
      id: plan.id,
      title: plan.title,
      city: plan.city,
      status: plan.status,
      dateRangeStart: plan.dateRangeStart,
      dateRangeEnd: plan.dateRangeEnd,
    },
    participantCount: data.participants.filter((p) => p.status === "connected").length,
    participants: data.participants
      .filter((p) => p.status === "connected")
      .map((p) => ({
        name: p.email.split("@")[0],
        preferences: p.preferencesJson
          ? (JSON.parse(p.preferencesJson) as { notes?: string }).notes
          : undefined,
      })),
    joined: !!myParticipant,
    isOrganizer: session?.user?.id === plan.organizerId,
    results,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { token } = await params;
  const plan = await getPlanByShareToken(token);

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  if (plan.status === "voting") {
    return NextResponse.json(
      { error: "Sign-ups are closed — voting is open" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const db = getDb();
  const preferencesJson = JSON.stringify({
    notes: parsed.data.preferences?.trim() || "",
  });

  const existing = await db.query.participants.findFirst({
    where: and(
      eq(participants.planId, plan.id),
      eq(participants.userId, session.user.id)
    ),
  });

  if (existing) {
    await db
      .update(participants)
      .set({
        preferencesJson,
        status: "connected",
      })
      .where(eq(participants.id, existing.id));
  } else {
    await db.insert(participants).values({
      id: uuidv4(),
      planId: plan.id,
      userId: session.user.id,
      email: session.user.email,
      preferencesJson,
      status: "connected",
    });
  }

  return NextResponse.json({ success: true, planId: plan.id });
}
