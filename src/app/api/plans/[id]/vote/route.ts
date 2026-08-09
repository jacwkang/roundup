import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlanWithParticipants } from "@/lib/plans/service";
import { toggleVote, getLatestPlanResults } from "@/lib/plans/results";
import { z } from "zod";

const voteSchema = z.object({
  optionId: z.string().min(1),
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

  const isOrganizer = data.plan.organizerId === session.user.id;
  const isParticipant = data.participants.some(
    (p) => p.userId === session.user.id
  );

  if (!isOrganizer && !isParticipant) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = await getLatestPlanResults(id);
  if (!results) {
    return NextResponse.json({ error: "No results to vote on yet" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid option" }, { status: 400 });
  }

  const validOption = results.options.some((o) => o.id === parsed.data.optionId);
  if (!validOption) {
    return NextResponse.json({ error: "Option not found" }, { status: 404 });
  }

  const voteResult = await toggleVote(id, session.user.id, parsed.data.optionId);

  return NextResponse.json(voteResult);
}
