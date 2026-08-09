export interface TimeSlot {
  start: string;
  end: string;
  score?: number;
  reason?: string;
}

export interface BusyBlock {
  start: Date;
  end: Date;
}

export interface Restaurant {
  name: string;
  rating: number;
  reviewCount: number;
  priceLevel?: string;
  cuisines: string[];
  neighborhood?: string;
  url: string;
  address?: string;
}

export interface LocalEvent {
  name: string;
  venue: string;
  start: string;
  end?: string;
  category: string;
  priceRange?: string;
  url: string;
  imageUrl?: string;
  source: "ticketmaster" | "eventbrite";
}

export interface ReservationSlot {
  venueName: string;
  provider: "resy" | "opentable";
  times: string[];
  bookUrl: string;
  slotStart: string;
}

export interface ActivitySuggestion {
  type: "restaurant" | "event" | "general";
  title: string;
  why: string;
  slotIndex: number;
  reservation?: {
    provider: string;
    times: string[];
    bookUrl: string;
  };
  eventUrl?: string;
}

export interface SuggestionResult {
  rankedSlots: TimeSlot[];
  activities: ActivitySuggestion[];
  emailSubject: string;
  emailBodyMarkdown: string;
}

export interface PlanPreferences {
  tags?: string[];
  notes?: string;
  eveningOnly?: boolean;
}

export interface VotableOption {
  id: string;
  label: string;
  description?: string;
  slotStart?: string;
  slotEnd?: string;
  activityType?: "restaurant" | "event" | "general";
  bookUrl?: string;
  eventUrl?: string;
  reservationTimes?: string[];
}
