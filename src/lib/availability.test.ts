import { describe, it, expect } from "vitest";
import {
  findMutualFreeSlots,
  freeBusyToBusyBlocks,
  splitIntoHangoutSlots,
} from "@/lib/availability";

describe("findMutualFreeSlots", () => {
  const windowStart = new Date("2026-06-21T08:00:00Z");
  const windowEnd = new Date("2026-06-21T22:00:00Z");
  const minDuration = 2 * 60 * 60 * 1000;

  it("finds gap when one participant is busy in the middle", () => {
    const p1: import("@/lib/availability").BusyBlock[] = [
      {
        start: new Date("2026-06-21T12:00:00Z"),
        end: new Date("2026-06-21T14:00:00Z"),
      },
    ];
    const p2: import("@/lib/availability").BusyBlock[] = [];

    const slots = findMutualFreeSlots(
      [p1, p2],
      windowStart,
      windowEnd,
      minDuration
    );

    expect(slots.length).toBeGreaterThan(0);
    const hasMorning = slots.some(
      (s) => s.start.getTime() <= new Date("2026-06-21T12:00:00Z").getTime()
    );
    expect(hasMorning).toBe(true);
  });

  it("returns empty when both fully booked", () => {
    const busy = [
      {
        start: new Date("2026-06-21T08:00:00Z"),
        end: new Date("2026-06-21T22:00:00Z"),
      },
    ];

    const slots = findMutualFreeSlots(
      [busy, busy],
      windowStart,
      windowEnd,
      minDuration
    );

    expect(slots).toHaveLength(0);
  });

  it("finds mutual free when schedules overlap partially", () => {
    const p1 = [
      {
        start: new Date("2026-06-21T09:00:00Z"),
        end: new Date("2026-06-21T11:00:00Z"),
      },
    ];
    const p2 = [
      {
        start: new Date("2026-06-21T10:00:00Z"),
        end: new Date("2026-06-21T12:00:00Z"),
      },
    ];

    const slots = findMutualFreeSlots(
      [p1, p2],
      windowStart,
      windowEnd,
      minDuration
    );

    const afternoonFree = slots.some(
      (s) => s.start.getTime() >= new Date("2026-06-21T12:00:00Z").getTime()
    );
    expect(afternoonFree).toBe(true);
  });
});

describe("freeBusyToBusyBlocks", () => {
  it("extracts busy blocks from freeBusy response", () => {
    const calendars = {
      primary: {
        busy: [
          { start: "2026-06-21T10:00:00Z", end: "2026-06-21T11:00:00Z" },
        ],
      },
    };

    const blocks = freeBusyToBusyBlocks(calendars, ["primary"]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.start.toISOString()).toBe("2026-06-21T10:00:00.000Z");
  });
});

describe("splitIntoHangoutSlots", () => {
  it("splits long window into multiple slots", () => {
    const window = {
      start: new Date("2026-06-21T14:00:00Z"),
      end: new Date("2026-06-21T20:00:00Z"),
    };
    const slots = splitIntoHangoutSlots(window, 2 * 60 * 60 * 1000);
    expect(slots.length).toBeGreaterThanOrEqual(2);
  });
});
