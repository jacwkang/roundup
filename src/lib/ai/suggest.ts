import OpenAI from "openai";
import type {
  TimeSlot,
  Restaurant,
  LocalEvent,
  ReservationSlot,
  SuggestionResult,
  PlanPreferences,
} from "@/types";

const SYSTEM_PROMPT = `You are a friendly hangout planning assistant. Given mutual free time slots, popular restaurants, local events, and reservation availability, suggest the best hangout options.

Rules:
- Rank bookable restaurants first (those with confirmed open tables)
- Then timed events that fit each slot
- Then general hangout ideas as fallback
- Keep tone casual and warm
- Return valid JSON only`;

export async function generateSuggestions(input: {
  slots: TimeSlot[];
  groupSize: number;
  city: string;
  preferences: PlanPreferences;
  restaurants: Restaurant[];
  events: LocalEvent[];
  reservations: ReservationSlot[];
}): Promise<SuggestionResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return buildFallbackSuggestions(input);
  }

  const openai = new OpenAI({ apiKey });

  const userPrompt = JSON.stringify(
    {
      mutualFreeSlots: input.slots,
      groupSize: input.groupSize,
      city: input.city,
      preferences: input.preferences,
      restaurants: input.restaurants.slice(0, 8),
      events: input.events.slice(0, 8),
      reservations: input.reservations,
    },
    null,
    2
  );

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Generate hangout suggestions as JSON with this schema:
{
  "ranked_slots": [{ "start": "ISO", "end": "ISO", "score": 0-1, "reason": "..." }],
  "activities": [{ "type": "restaurant|event|general", "title": "...", "why": "...", "slot_index": 0, "reservation": { "provider": "...", "times": [], "book_url": "..." }, "event_url": "..." }],
  "email_subject": "...",
  "email_body_markdown": "..."
}

Use {respond_link_1}, {respond_link_2}, {respond_link_3} placeholders in email for slot accept links.

Input data:
${userPrompt}`,
        },
      ],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const parsed = JSON.parse(content) as {
      ranked_slots: TimeSlot[];
      activities: SuggestionResult["activities"];
      email_subject: string;
      email_body_markdown: string;
    };

    return {
      rankedSlots: parsed.ranked_slots ?? input.slots,
      activities: parsed.activities ?? [],
      emailSubject: parsed.email_subject ?? `Hangout plan for ${input.city}`,
      emailBodyMarkdown: parsed.email_body_markdown ?? buildDefaultEmailBody(input),
    };
  } catch (error) {
    console.error("AI suggestion error:", error);
    return buildFallbackSuggestions(input);
  }
}

function buildFallbackSuggestions(input: {
  slots: TimeSlot[];
  groupSize: number;
  city: string;
  restaurants: Restaurant[];
  events: LocalEvent[];
  reservations: ReservationSlot[];
}): SuggestionResult {
  const activities: SuggestionResult["activities"] = [];

  for (const res of input.reservations.slice(0, 2)) {
    activities.push({
      type: "restaurant",
      title: `Dinner at ${res.venueName}`,
      why: `Top-rated spot with tables at ${res.times.join(", ")}`,
      slotIndex: 0,
      reservation: {
        provider: res.provider,
        times: res.times,
        bookUrl: res.bookUrl,
      },
    });
  }

  for (const event of input.events.slice(0, 2)) {
    activities.push({
      type: "event",
      title: event.name,
      why: `${event.category} at ${event.venue}`,
      slotIndex: 0,
      eventUrl: event.url,
    });
  }

  if (activities.length === 0 && input.restaurants[0]) {
    activities.push({
      type: "restaurant",
      title: `Try ${input.restaurants[0].name}`,
      why: `Rated ${input.restaurants[0].rating}/5 in ${input.city}`,
      slotIndex: 0,
    });
  }

  return {
    rankedSlots: input.slots,
    activities,
    emailSubject: `Let's hang out in ${input.city}!`,
    emailBodyMarkdown: buildDefaultEmailBody(input),
  };
}

function buildDefaultEmailBody(input: {
  slots: TimeSlot[];
  city: string;
  activities: SuggestionResult["activities"];
} & { restaurants: Restaurant[]; events: LocalEvent[]; reservations: ReservationSlot[] }): string {
  const slotLines = input.slots.slice(0, 3).map((s, i) => {
    const start = new Date(s.start).toLocaleString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return `**Option ${i + 1}:** ${start} — {respond_link_${i + 1}}`;
  });

  const activityLines = input.activities.slice(0, 4).map((a) => {
    if (a.reservation) {
      return `- **${a.title}** — ${a.why} [Book here](${a.reservation.bookUrl})`;
    }
    if (a.eventUrl) {
      return `- **${a.title}** — ${a.why} [Details](${a.eventUrl})`;
    }
    return `- **${a.title}** — ${a.why}`;
  });

  return `Hey everyone!

I found some times that work for all of us in **${input.city}**:

${slotLines.join("\n\n")}

**Ideas for what to do:**

${activityLines.join("\n")}

Let me know which option works best!`;
}
