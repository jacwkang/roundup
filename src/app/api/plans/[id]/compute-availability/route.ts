import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computePlanAvailability, getPlanWithParticipants } from "@/lib/plans/service";

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

  try {
    const slots = await computePlanAvailability(id);
    return NextResponse.json({ slots });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute availability";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
