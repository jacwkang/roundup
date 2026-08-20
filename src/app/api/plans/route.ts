import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hangoutPlans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getJoinUrl } from "@/lib/plans/share";
import { z } from "zod";

const createPlanSchema = z.object({
  title: z.string().min(1),
  city: z.string().min(1),
  timezone: z.string().default("America/New_York"),
  dateRangeStart: z.string(),
  dateRangeEnd: z.string(),
  minDurationMinutes: z.number().min(30).default(120),
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
  const shareToken = uuidv4().replace(/-/g, "").slice(0, 12);

  await db.insert(hangoutPlans).values({
    id: planId,
    organizerId: session.user.id,
    title: data.title,
    city: data.city,
    timezone: data.timezone,
    dateRangeStart: new Date(data.dateRangeStart),
    dateRangeEnd: new Date(data.dateRangeEnd),
    minDurationMinutes: data.minDurationMinutes,
    preferencesJson: "{}",
    status: "collecting",
    shareToken,
  });

  const inviteUrl = getJoinUrl(shareToken);

  return NextResponse.json({
    planId,
    shareToken,
    inviteUrl,
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

  return NextResponse.json({
    plans: plans.map((p) => ({
      ...p,
      inviteUrl: getJoinUrl(p.shareToken),
    })),
  });
}
