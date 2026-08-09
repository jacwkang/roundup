import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { planResults, optionVotes, hangoutPlans } from "@/lib/db/schema";
import type {
  VotableOption,
  SuggestionResult,
  TimeSlot,
  ReservationSlot,
} from "@/types";

export function buildVotableOptions(
  suggestions: SuggestionResult,
  slots: TimeSlot[],
  reservations: ReservationSlot[]
): VotableOption[] {
  const options: VotableOption[] = [];

  if (suggestions.activities.length > 0) {
    for (let i = 0; i < suggestions.activities.length; i++) {
      const activity = suggestions.activities[i]!;
      const slot = slots[activity.slotIndex] ?? slots[0];
      const reservation = activity.reservation;
      const matchingRes = reservations.find(
        (r) => r.venueName === activity.title.replace(/^Dinner at /, "")
      );

      options.push({
        id: `activity-${i}`,
        label: activity.title,
        description: activity.why,
        slotStart: slot?.start,
        slotEnd: slot?.end,
        activityType: activity.type,
        bookUrl: reservation?.bookUrl ?? matchingRes?.bookUrl,
        eventUrl: activity.eventUrl,
        reservationTimes: reservation?.times ?? matchingRes?.times,
      });
    }
  }

  suggestions.rankedSlots.slice(0, 3).forEach((slot, i) => {
    const alreadyCovered = options.some((o) => o.slotStart === slot.start);
    if (!alreadyCovered) {
      const start = new Date(slot.start);
      options.push({
        id: `slot-${i}`,
        label: formatSlotLabel(start, new Date(slot.end)),
        description: slot.reason ?? "Everyone is free",
        slotStart: slot.start,
        slotEnd: slot.end,
        activityType: "general",
      });
    }
  });

  return options.slice(0, 6);
}

function formatSlotLabel(start: Date, end: Date): string {
  const date = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date}, ${time} – ${endTime}`;
}

export async function savePlanResults(
  planId: string,
  options: VotableOption[]
): Promise<string> {
  const db = getDb();

  await db.delete(optionVotes).where(eq(optionVotes.planId, planId));

  const resultId = uuidv4();

  await db.insert(planResults).values({
    id: resultId,
    planId,
    optionsJson: JSON.stringify(options),
  });

  await db
    .update(hangoutPlans)
    .set({ status: "voting" })
    .where(eq(hangoutPlans.id, planId));

  return resultId;
}

export async function getLatestPlanResults(planId: string) {
  const db = getDb();
  const result = await db.query.planResults.findFirst({
    where: eq(planResults.planId, planId),
    orderBy: (r, { desc }) => [desc(r.generatedAt)],
  });

  if (!result) return null;

  return {
    id: result.id,
    options: JSON.parse(result.optionsJson) as VotableOption[],
    generatedAt: result.generatedAt,
  };
}

export async function getResultsWithVotes(planId: string, userId: string) {
  const results = await getLatestPlanResults(planId);
  if (!results) return null;

  const db = getDb();
  const allVotes = await db.query.optionVotes.findMany({
    where: eq(optionVotes.planId, planId),
  });

  const voteCounts: Record<string, number> = {};
  const votersByOption: Record<string, string[]> = {};

  for (const vote of allVotes) {
    voteCounts[vote.optionId] = (voteCounts[vote.optionId] ?? 0) + 1;
    if (!votersByOption[vote.optionId]) votersByOption[vote.optionId] = [];
    votersByOption[vote.optionId]!.push(vote.userId);
  }

  const userVotes = allVotes
    .filter((v) => v.userId === userId)
    .map((v) => v.optionId);

  const options = results.options
    .map((option) => ({
      ...option,
      voteCount: voteCounts[option.id] ?? 0,
      userVoted: userVotes.includes(option.id),
    }))
    .sort((a, b) => b.voteCount - a.voteCount);

  return {
    generatedAt: results.generatedAt,
    options,
    totalVoters: new Set(allVotes.map((v) => v.userId)).size,
  };
}

export async function toggleVote(
  planId: string,
  userId: string,
  optionId: string
): Promise<{ voted: boolean; voteCount: number }> {
  const db = getDb();
  const existing = await db.query.optionVotes.findFirst({
    where: and(
      eq(optionVotes.planId, planId),
      eq(optionVotes.userId, userId),
      eq(optionVotes.optionId, optionId)
    ),
  });

  if (existing) {
    await db.delete(optionVotes).where(eq(optionVotes.id, existing.id));
  } else {
    await db.insert(optionVotes).values({
      id: uuidv4(),
      planId,
      userId,
      optionId,
    });
  }

  const votes = await db.query.optionVotes.findMany({
    where: and(
      eq(optionVotes.planId, planId),
      eq(optionVotes.optionId, optionId)
    ),
  });

  return { voted: !existing, voteCount: votes.length };
}
