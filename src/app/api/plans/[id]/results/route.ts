import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlanWithParticipants } from "@/lib/plans/service";
import { getResultsWithVotes } from "@/lib/plans/results";

export async function GET(
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

  const isOrganizer = data.plan.organizerId === session.user.id;
  const isParticipant = data.participants.some(
    (p) => p.userId === session.user.id
  );

  if (!isOrganizer && !isParticipant) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = await getResultsWithVotes(id, session.user.id);
  if (!results) {
    return NextResponse.json({ results: null, status: data.plan.status });
  }

  return NextResponse.json({
    results,
    status: data.plan.status,
  });
}
