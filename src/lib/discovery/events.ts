import type { LocalEvent } from "@/types";

export async function fetchLocalEvents(
  city: string,
  startDate: Date,
  endDate: Date,
  limit = 15
): Promise<LocalEvent[]> {
  const [ticketmaster, eventbrite] = await Promise.all([
    fetchTicketmasterEvents(city, startDate, endDate),
    fetchEventbriteEvents(city, startDate, endDate),
  ]);

  const merged = [...ticketmaster, ...eventbrite]
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, limit);

  return dedupeEvents(merged);
}

async function fetchTicketmasterEvents(
  city: string,
  startDate: Date,
  endDate: Date
): Promise<LocalEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return getMockTicketmasterEvents(city);

  const params = new URLSearchParams({
    apikey: apiKey,
    city,
    startDateTime: startDate.toISOString().replace(/\.\d{3}Z$/, "Z"),
    endDateTime: endDate.toISOString().replace(/\.\d{3}Z$/, "Z"),
    size: "20",
    sort: "date,asc",
  });

  const response = await fetch(
    `https://app.ticketmaster.com/discovery/v2/events.json?${params}`
  );

  if (!response.ok) {
    console.error("Ticketmaster API error:", await response.text());
    return getMockTicketmasterEvents(city);
  }

  const data = (await response.json()) as {
    _embedded?: {
      events?: Array<{
        name: string;
        url: string;
        dates?: { start?: { dateTime?: string; localDate?: string } };
        classifications?: Array<{ segment?: { name?: string } }>;
        priceRanges?: Array<{ min?: number; max?: number }>;
        images?: Array<{ url: string; width: number }>;
        _embedded?: { venues?: Array<{ name?: string; city?: { name?: string } }> };
      }>;
    };
  };

  return (data._embedded?.events ?? []).map((e) => {
    const venue = e._embedded?.venues?.[0];
    const image = e.images?.sort((a, b) => b.width - a.width)[0];
    const priceMin = e.priceRanges?.[0]?.min;
    const priceMax = e.priceRanges?.[0]?.max;

    return {
      name: e.name,
      venue: venue?.name ?? city,
      start: e.dates?.start?.dateTime ?? `${e.dates?.start?.localDate}T19:00:00`,
      category: e.classifications?.[0]?.segment?.name ?? "Event",
      priceRange:
        priceMin != null
          ? `$${priceMin}${priceMax != null ? `–$${priceMax}` : ""}`
          : undefined,
      url: e.url,
      imageUrl: image?.url,
      source: "ticketmaster" as const,
    };
  });
}

async function fetchEventbriteEvents(
  city: string,
  startDate: Date,
  endDate: Date
): Promise<LocalEvent[]> {
  const token = process.env.EVENTBRITE_API_TOKEN;
  if (!token) return getMockEventbriteEvents(city);

  const params = new URLSearchParams({
    "location.address": city,
    "start_date.range_start": startDate.toISOString(),
    "start_date.range_end": endDate.toISOString(),
    expand: "venue",
  });

  const response = await fetch(
    `https://www.eventbriteapi.com/v3/events/search/?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    console.error("Eventbrite API error:", await response.text());
    return getMockEventbriteEvents(city);
  }

  const data = (await response.json()) as {
    events?: Array<{
      name: { text: string };
      url: string;
      start: { utc: string };
      end?: { utc: string };
      category_id?: string;
      logo?: { url?: string };
    }>;
  };

  return (data.events ?? []).map((e) => ({
    name: e.name.text,
    venue: city,
    start: e.start.utc,
    end: e.end?.utc,
    category: "Community",
    url: e.url,
    imageUrl: e.logo?.url,
    source: "eventbrite" as const,
  }));
}

function dedupeEvents(events: LocalEvent[]): LocalEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.name}-${e.start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getMockTicketmasterEvents(city: string): LocalEvent[] {
  const base = new Date();
  base.setDate(base.getDate() + 3);
  return [
    {
      name: "Live Jazz Night",
      venue: `${city} Music Hall`,
      start: base.toISOString(),
      category: "Music",
      priceRange: "$25–$45",
      url: "https://www.ticketmaster.com",
      source: "ticketmaster",
    },
  ];
}

function getMockEventbriteEvents(city: string): LocalEvent[] {
  const base = new Date();
  base.setDate(base.getDate() + 5);
  return [
    {
      name: "Community Food Festival",
      venue: `${city} Park`,
      start: base.toISOString(),
      category: "Food & Drink",
      url: "https://www.eventbrite.com",
      source: "eventbrite",
    },
  ];
}

export function filterEventsForSlots(
  events: LocalEvent[],
  slotStarts: Date[],
  bufferMinutes = 90
): LocalEvent[] {
  const bufferMs = bufferMinutes * 60 * 1000;

  return events.filter((event) => {
    const eventStart = new Date(event.start).getTime();
    return slotStarts.some((slot) => {
      const slotStart = slot.getTime();
      return eventStart >= slotStart - bufferMs && eventStart <= slotStart + bufferMs * 2;
    });
  });
}
