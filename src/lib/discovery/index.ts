import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activityDiscoveryRuns } from "@/lib/db/schema";
import { fetchPopularRestaurants } from "./restaurants";
import { fetchLocalEvents, filterEventsForSlots } from "./events";
import type { PlanPreferences, Restaurant, LocalEvent } from "@/types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface DiscoveryResult {
  restaurants: Restaurant[];
  events: LocalEvent[];
  runId: string;
}

export async function discoverActivities(
  planId: string,
  city: string,
  startDate: Date,
  endDate: Date,
  preferences: PlanPreferences,
  slotStarts: Date[] = []
): Promise<DiscoveryResult> {
  const db = getDb();

  const cached = await db.query.activityDiscoveryRuns.findFirst({
    where: eq(activityDiscoveryRuns.planId, planId),
    orderBy: (runs, { desc }) => [desc(runs.computedAt)],
  });

  if (
    cached &&
    Date.now() - cached.computedAt.getTime() < CACHE_TTL_MS
  ) {
    return {
      restaurants: JSON.parse(cached.restaurantsJson) as Restaurant[],
      events: JSON.parse(cached.eventsJson) as LocalEvent[],
      runId: cached.id,
    };
  }

  const [restaurants, allEvents] = await Promise.all([
    fetchPopularRestaurants(city, preferences, 10),
    fetchLocalEvents(city, startDate, endDate, 15),
  ]);

  const events =
    slotStarts.length > 0
      ? filterEventsForSlots(allEvents, slotStarts)
      : allEvents;

  const runId = uuidv4();
  await db.insert(activityDiscoveryRuns).values({
    id: runId,
    planId,
    restaurantsJson: JSON.stringify(restaurants),
    eventsJson: JSON.stringify(events),
  });

  return { restaurants, events, runId };
}
