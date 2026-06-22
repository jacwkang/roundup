import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reservationAvailability } from "@/lib/db/schema";
import { matchRestaurantToProvider } from "./match-venue";
import { fetchResyAvailability, fetchOpenTableAvailability } from "./resy";
import type { Restaurant, ReservationSlot } from "@/types";

export async function pollReservationsForPlan(
  planId: string,
  restaurants: Restaurant[],
  city: string,
  partySize: number,
  slotStarts: Date[]
): Promise<ReservationSlot[]> {
  const db = getDb();
  const results: ReservationSlot[] = [];
  const topRestaurants = restaurants.slice(0, 5);

  for (const restaurant of topRestaurants) {
    const match = await matchRestaurantToProvider(restaurant, city);
    if (!match) continue;

    for (const slotStart of slotStarts.slice(0, 3)) {
      let availability: { times: string[]; bookUrl: string };

      if (match.provider === "resy") {
        availability = await fetchResyAvailability(
          match.providerVenueId,
          slotStart,
          partySize,
          match.bookUrl
        );
      } else {
        availability = await fetchOpenTableAvailability(
          match.providerVenueId,
          slotStart,
          partySize,
          match.bookUrl
        );
      }

      if (availability.times.length === 0 && match.provider === "opentable") {
        availability.times = ["Check OpenTable for times"];
      }

      if (availability.times.length === 0) continue;

      const record = {
        id: uuidv4(),
        planId,
        venueName: restaurant.name,
        provider: match.provider,
        partySize,
        slotStart,
        slotEnd: null,
        availableTimesJson: JSON.stringify(availability.times),
        bookUrl: availability.bookUrl,
      };

      await db.insert(reservationAvailability).values(record);

      results.push({
        venueName: restaurant.name,
        provider: match.provider,
        times: availability.times,
        bookUrl: availability.bookUrl,
        slotStart: slotStart.toISOString(),
      });
    }
  }

  return results;
}

export async function getStoredReservations(
  planId: string
): Promise<ReservationSlot[]> {
  const db = getDb();
  const rows = await db.query.reservationAvailability.findMany({
    where: eq(reservationAvailability.planId, planId),
  });

  return rows.map((r) => ({
    venueName: r.venueName,
    provider: r.provider as "resy" | "opentable",
    times: JSON.parse(r.availableTimesJson) as string[],
    bookUrl: r.bookUrl,
    slotStart: r.slotStart.toISOString(),
  }));
}
