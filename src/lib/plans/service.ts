import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import {
  hangoutPlans,
  participants,
  users,
  availabilityRuns,
  activityDiscoveryRuns,
} from "@/lib/db/schema";
import {
  findMutualFreeSlots,
  freeBusyToBusyBlocks,
  splitIntoHangoutSlots,
} from "@/lib/availability";
import { queryFreeBusy } from "@/lib/google/calendar";
import { discoverActivities } from "@/lib/discovery";
import { pollReservationsForPlan, getStoredReservations } from "@/lib/reservations";
import { generateSuggestions } from "@/lib/ai/suggest";
import {
  buildVotableOptions,
  savePlanResults,
  getLatestPlanResults,
} from "@/lib/plans/results";
import type { TimeSlot, PlanPreferences } from "@/types";

export async function getPlanWithParticipants(planId: string) {
  const db = getDb();
  const plan = await db.query.hangoutPlans.findFirst({
    where: eq(hangoutPlans.id, planId),
  });
  if (!plan) return null;

  const planParticipants = await db.query.participants.findMany({
    where: eq(participants.planId, planId),
  });

  const organizer = await db.query.users.findFirst({
    where: eq(users.id, plan.organizerId),
  });

  return { plan, participants: planParticipants, organizer };
}

export async function computePlanAvailability(planId: string): Promise<TimeSlot[]> {
  const data = await getPlanWithParticipants(planId);
  if (!data) throw new Error("Plan not found");

  const { plan, participants: planParticipants } = data;

  const connectedUserIds = [
    plan.organizerId,
    ...planParticipants
      .filter((p) => p.status === "connected" && p.userId)
      .map((p) => p.userId!),
  ];

  const uniqueUserIds = [...new Set(connectedUserIds)];

  const freeBusy = await queryFreeBusy(
    uniqueUserIds,
    plan.dateRangeStart,
    plan.dateRangeEnd
  );

  const participantBlocks = uniqueUserIds.map((userId) =>
    freeBusyToBusyBlocks(
      { [userId]: freeBusy[userId] ?? { busy: [] } },
      [userId]
    )
  );

  const minDurationMs = plan.minDurationMinutes * 60 * 1000;
  const freeWindows = findMutualFreeSlots(
    participantBlocks,
    plan.dateRangeStart,
    plan.dateRangeEnd,
    minDurationMs,
    10
  );

  const slots: TimeSlot[] = [];
  for (const window of freeWindows.slice(0, 5)) {
    const hangoutSlots = splitIntoHangoutSlots(window, minDurationMs);
    for (const slot of hangoutSlots.slice(0, 1)) {
      slots.push({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
      });
    }
  }

  const db = getDb();
  await db.insert(availabilityRuns).values({
    id: uuidv4(),
    planId,
    slotsJson: JSON.stringify(slots),
  });

  if (plan.status === "collecting" && slots.length > 0) {
    await db
      .update(hangoutPlans)
      .set({ status: "ready" })
      .where(eq(hangoutPlans.id, planId));
  }

  return slots;
}

export async function getLatestSlots(planId: string): Promise<TimeSlot[]> {
  const db = getDb();
  const run = await db.query.availabilityRuns.findFirst({
    where: eq(availabilityRuns.planId, planId),
    orderBy: (runs, { desc }) => [desc(runs.computedAt)],
  });

  if (!run) return [];
  return JSON.parse(run.slotsJson) as TimeSlot[];
}

export async function runFullSuggestionPipeline(planId: string) {
  const data = await getPlanWithParticipants(planId);
  if (!data) throw new Error("Plan not found");

  const { plan, participants: planParticipants } = data;
  const preferences = JSON.parse(plan.preferencesJson ?? "{}") as PlanPreferences;

  let slots = await getLatestSlots(planId);
  if (slots.length === 0) {
    slots = await computePlanAvailability(planId);
  }

  const slotStarts = slots.map((s) => new Date(s.start));
  const partySize = planParticipants.filter((p) => p.status === "connected").length + 1;

  const { restaurants, events } = await discoverActivities(
    planId,
    plan.city,
    plan.dateRangeStart,
    plan.dateRangeEnd,
    preferences,
    slotStarts
  );

  const reservations = await pollReservationsForPlan(
    planId,
    restaurants,
    plan.city,
    Math.max(partySize, 2),
    slotStarts
  );

  const suggestions = await generateSuggestions({
    slots,
    groupSize: partySize,
    city: plan.city,
    preferences,
    restaurants,
    events,
    reservations,
  });

  const options = buildVotableOptions(suggestions, slots, reservations);
  await savePlanResults(planId, options);

  return { slots, restaurants, events, reservations, suggestions, options };
}

export { getLatestPlanResults };

export async function getStoredSuggestionInputs(planId: string) {
  const slots = await getLatestSlots(planId);
  const reservations = await getStoredReservations(planId);

  const db = getDb();
  const discovery = await db.query.activityDiscoveryRuns.findFirst({
    where: eq(activityDiscoveryRuns.planId, planId),
    orderBy: (runs, { desc }) => [desc(runs.computedAt)],
  });

  return {
    slots,
    reservations,
    restaurants: discovery
      ? (JSON.parse(discovery.restaurantsJson) as import("@/types").Restaurant[])
      : [],
    events: discovery
      ? (JSON.parse(discovery.eventsJson) as import("@/types").LocalEvent[])
      : [],
  };
}
