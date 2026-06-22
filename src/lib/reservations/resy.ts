export interface AvailabilityResult {
  times: string[];
  bookUrl: string;
}

export async function fetchResyAvailability(
  venueId: string,
  date: Date,
  partySize: number,
  bookUrl: string
): Promise<AvailabilityResult> {
  try {
    const dateStr = date.toISOString().split("T")[0];
    const response = await fetch(
      `https://api.resy.com/4/find?lat=0&long=0&day=${dateStr}&party_size=${partySize}&venue_id=${venueId}`,
      {
        headers: {
          Authorization: 'ResyAPI api_key="VbWk7s3L6KiDspwf33VDDXsUe5Yx9Utr"',
          Origin: "https://resy.com",
          "X-Origin": "https://resy.com",
        },
      }
    );

    if (!response.ok) {
      return { times: [], bookUrl };
    }

    const data = (await response.json()) as {
      results?: {
        venues?: Array<{
          slots?: Array<{
            date?: { start?: string };
            config?: { token?: string };
          }>;
        }>;
      };
    };

    const slots = data.results?.venues?.[0]?.slots ?? [];
    const times = slots
      .map((s) => {
        if (!s.date?.start) return null;
        const d = new Date(s.date.start);
        return d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
      })
      .filter((t): t is string => t != null)
      .slice(0, 5);

    return { times, bookUrl };
  } catch {
    return { times: [], bookUrl };
  }
}

export async function fetchOpenTableAvailability(
  venueSlug: string,
  date: Date,
  partySize: number,
  bookUrl: string
): Promise<AvailabilityResult> {
  const dateStr = date.toISOString().split("T")[0];
  const time = "19:00";

  const deepLink =
    bookUrl ||
    `https://www.opentable.com/s?covers=${partySize}&dateTime=${dateStr}T${time}&term=${encodeURIComponent(venueSlug)}`;

  return {
    times: [],
    bookUrl: deepLink,
  };
}
