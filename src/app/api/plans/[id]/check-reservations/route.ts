import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getPlanWithParticipants,
  getLatestSlots,
} from "@/lib/plans/service";
import { discoverActivities } from "@/lib/discovery";
import { pollReservationsForPlan } from "@/lib/reservations";
import type { PlanPreferences } from "@/types";

export async function POST(
  _request: NextRequest,
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

  const preferences = JSON.parse(
    data.plan.preferencesJson ?? "{}"
  ) as PlanPreferences;
  const slots = await getLatestSlots(id);
  const slotStarts = slots.map((s) => new Date(s.start));
  const partySize =
    data.participants.filter((p) => p.status === "connected").length + 1;

  const { restaurants } = await discoverActivities(
    id,
    data.plan.city,
    data.plan.dateRangeStart,
    data.plan.dateRangeEnd,
    preferences,
    slotStarts
  );

  const reservations = await pollReservationsForPlan(
    id,
    restaurants,
    data.plan.city,
    Math.max(partySize, 2),
    slotStarts
  );

  return NextResponse.json({ reservations });
}
