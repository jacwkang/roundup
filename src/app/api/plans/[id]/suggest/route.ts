import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlanWithParticipants, runFullSuggestionPipeline } from "@/lib/plans/service";

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
    const result = await runFullSuggestionPipeline(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suggestion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
