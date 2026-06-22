import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { venueMappings } from "@/lib/db/schema";
import type { Restaurant } from "@/types";

export interface VenueMatch {
  provider: "resy" | "opentable";
  providerVenueId: string;
  bookUrl: string;
}

/** Fuzzy match restaurant to known Resy/OpenTable venue IDs */
export async function matchRestaurantToProvider(
  restaurant: Restaurant,
  city: string
): Promise<VenueMatch | null> {
  const db = getDb();
  const normalized = restaurant.name.toLowerCase().trim();

  const cached = await db.query.venueMappings.findFirst({
    where: and(
      eq(venueMappings.city, city.toLowerCase()),
      eq(venueMappings.restaurantName, normalized)
    ),
  });

  if (cached) {
    return {
      provider: cached.provider as "resy" | "opentable",
      providerVenueId: cached.providerVenueId,
      bookUrl: cached.bookUrl ?? buildBookUrl(cached.provider as "resy" | "opentable", cached.providerVenueId),
    };
  }

  const resyMatch = await searchResyVenue(restaurant.name, city);
  if (resyMatch) {
    await cacheMapping(normalized, city, resyMatch);
    return resyMatch;
  }

  const otMatch = searchOpenTableVenue(restaurant.name, city);
  if (otMatch) {
    await cacheMapping(normalized, city, otMatch);
    return otMatch;
  }

  return null;
}

async function cacheMapping(
  name: string,
  city: string,
  match: VenueMatch
) {
  const db = getDb();
  await db.insert(venueMappings).values({
    id: uuidv4(),
    restaurantName: name,
    city: city.toLowerCase(),
    provider: match.provider,
    providerVenueId: match.providerVenueId,
    bookUrl: match.bookUrl,
  });
}

async function searchResyVenue(
  name: string,
  city: string
): Promise<VenueMatch | null> {
  try {
    const params = new URLSearchParams({
      query: name,
      geo: JSON.stringify({ latitude: 40.7128, longitude: -74.006 }),
      per_page: "5",
    });

    const response = await fetch(
      `https://api.resy.com/3/venues/search?${params}`,
      {
        headers: {
          Authorization: 'ResyAPI api_key="VbWk7s3L6KiDspwf33VDDXsUe5Yx9Utr"',
          Origin: "https://resy.com",
          "X-Origin": "https://resy.com",
        },
      }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      search?: { hits?: Array<{ _source?: { name?: string; id?: { resy?: number }; url_slug?: string } }> };
    };

    const hits = data.search?.hits ?? [];
    const match = hits.find((h) =>
      h._source?.name?.toLowerCase().includes(name.toLowerCase().slice(0, 5))
    );

    if (!match?._source?.id?.resy) return null;

    const venueId = String(match._source.id.resy);
    return {
      provider: "resy",
      providerVenueId: venueId,
      bookUrl: `https://resy.com/cities/${city.toLowerCase().replace(/\s+/g, "-")}/venues/${match._source.url_slug ?? venueId}`,
    };
  } catch {
    return null;
  }
}

function searchOpenTableVenue(
  name: string,
  city: string
): VenueMatch | null {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) return null;

  return {
    provider: "opentable",
    providerVenueId: slug,
    bookUrl: `https://www.opentable.com/s?covers=2&dateTime=${new Date().toISOString()}&metroId=&term=${encodeURIComponent(name + " " + city)}`,
  };
}

function buildBookUrl(provider: "resy" | "opentable", venueId: string): string {
  if (provider === "resy") {
    return `https://resy.com/venues/${venueId}`;
  }
  return `https://www.opentable.com/restref/client/?rid=${venueId}`;
}
