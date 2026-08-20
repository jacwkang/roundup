import {
  sqliteTable,
  text,
  integer,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  googleId: text("google_id").notNull().unique(),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  calendarId: text("calendar_id").default("primary"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const hangoutPlans = sqliteTable("hangout_plans", {
  id: text("id").primaryKey(),
  organizerId: text("organizer_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  city: text("city").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  dateRangeStart: integer("date_range_start", { mode: "timestamp" }).notNull(),
  dateRangeEnd: integer("date_range_end", { mode: "timestamp" }).notNull(),
  minDurationMinutes: integer("min_duration_minutes").notNull().default(120),
  preferencesJson: text("preferences_json").default("{}"),
  status: text("status", {
    enum: ["draft", "collecting", "ready", "voting", "sent"],
  })
    .notNull()
    .default("draft"),
  shareToken: text("share_token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const participants = sqliteTable("participants", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => hangoutPlans.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id),
  email: text("email").notNull(),
  preferencesJson: text("preferences_json").default("{}"),
  inviteToken: text("invite_token"),
  status: text("status", { enum: ["invited", "connected"] })
    .notNull()
    .default("invited"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const availabilityRuns = sqliteTable("availability_runs", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => hangoutPlans.id, { onDelete: "cascade" }),
  slotsJson: text("slots_json").notNull(),
  computedAt: integer("computed_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const activityDiscoveryRuns = sqliteTable("activity_discovery_runs", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => hangoutPlans.id, { onDelete: "cascade" }),
  restaurantsJson: text("restaurants_json").notNull(),
  eventsJson: text("events_json").notNull(),
  computedAt: integer("computed_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const reservationAvailability = sqliteTable("reservation_availability", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => hangoutPlans.id, { onDelete: "cascade" }),
  venueName: text("venue_name").notNull(),
  provider: text("provider", { enum: ["resy", "opentable"] }).notNull(),
  partySize: integer("party_size").notNull(),
  slotStart: integer("slot_start", { mode: "timestamp" }).notNull(),
  slotEnd: integer("slot_end", { mode: "timestamp" }),
  availableTimesJson: text("available_times_json").notNull(),
  bookUrl: text("book_url").notNull(),
  checkedAt: integer("checked_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const planResults = sqliteTable("plan_results", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => hangoutPlans.id, { onDelete: "cascade" }),
  optionsJson: text("options_json").notNull(),
  generatedAt: integer("generated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const optionVotes = sqliteTable("option_votes", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => hangoutPlans.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  optionId: text("option_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => hangoutPlans.id, { onDelete: "cascade" }),
  selectedSlotsJson: text("selected_slots_json").notNull(),
  activitiesJson: text("activities_json").notNull(),
  emailSubject: text("email_subject").notNull(),
  emailBody: text("email_body").notNull(),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const venueMappings = sqliteTable("venue_mappings", {
  id: text("id").primaryKey(),
  restaurantName: text("restaurant_name").notNull(),
  city: text("city").notNull(),
  provider: text("provider", { enum: ["resy", "opentable"] }).notNull(),
  providerVenueId: text("provider_venue_id").notNull(),
  bookUrl: text("book_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type HangoutPlan = typeof hangoutPlans.$inferSelect;
export type Participant = typeof participants.$inferSelect;
