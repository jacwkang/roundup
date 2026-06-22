export interface FreeWindow {
  start: Date;
  end: Date;
}

/**
 * Merge overlapping busy blocks and return gaps within [windowStart, windowEnd]
 * that are at least minDurationMs long.
 */
export function findMutualFreeSlots(
  participantBusyBlocks: BusyBlock[][],
  windowStart: Date,
  windowEnd: Date,
  minDurationMs: number,
  maxSlots = 10
): FreeWindow[] {
  const mergedBusy = mergeAllBusyBlocks(participantBusyBlocks, windowStart, windowEnd);
  const freeWindows: FreeWindow[] = [];

  let cursor = windowStart.getTime();

  for (const block of mergedBusy) {
    const gapEnd = block.start.getTime();
    if (gapEnd - cursor >= minDurationMs) {
      freeWindows.push({
        start: new Date(cursor),
        end: new Date(gapEnd),
      });
    }
    cursor = Math.max(cursor, block.end.getTime());
  }

  if (windowEnd.getTime() - cursor >= minDurationMs) {
    freeWindows.push({
      start: new Date(cursor),
      end: windowEnd,
    });
  }

  return scoreAndTrimSlots(freeWindows, minDurationMs, maxSlots);
}

function mergeAllBusyBlocks(
  participantBlocks: BusyBlock[][],
  windowStart: Date,
  windowEnd: Date
): BusyBlock[] {
  const all: BusyBlock[] = [];

  for (const blocks of participantBlocks) {
    for (const block of blocks) {
      const start = new Date(Math.max(block.start.getTime(), windowStart.getTime()));
      const end = new Date(Math.min(block.end.getTime(), windowEnd.getTime()));
      if (start < end) {
        all.push({ start, end });
      }
    }
  }

  if (all.length === 0) return [];

  all.sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: BusyBlock[] = [all[0]!];
  for (let i = 1; i < all.length; i++) {
    const current = all[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start.getTime() <= last.end.getTime()) {
      last.end = new Date(Math.max(last.end.getTime(), current.end.getTime()));
    } else {
      merged.push(current);
    }
  }

  return merged;
}

function scoreAndTrimSlots(
  windows: FreeWindow[],
  minDurationMs: number,
  maxSlots: number
): FreeWindow[] {
  const scored = windows
    .map((w) => {
      const duration = w.end.getTime() - w.start.getTime();
      const startHour = w.start.getUTCHours();
      const isWeekend = w.start.getUTCDay() === 0 || w.start.getUTCDay() === 6;
      const isAfternoon = startHour >= 12 && startHour <= 17;
      const isEvening = startHour >= 17 && startHour <= 21;

      let score = 0.5;
      if (isWeekend) score += 0.2;
      if (isAfternoon) score += 0.15;
      if (isEvening) score += 0.1;
      if (duration >= minDurationMs * 2) score += 0.1;

      return { window: w, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSlots);

  return scored.map((s) => s.window);
}

/** Split a free window into candidate hangout slots of at least minDurationMs */
export function splitIntoHangoutSlots(
  window: FreeWindow,
  minDurationMs: number
): FreeWindow[] {
  const slots: FreeWindow[] = [];
  let cursor = window.start.getTime();
  const end = window.end.getTime();

  while (cursor + minDurationMs <= end) {
    slots.push({
      start: new Date(cursor),
      end: new Date(cursor + minDurationMs),
    });
    cursor += minDurationMs;
  }

  return slots.length > 0 ? slots : [window];
}

export function freeBusyToBusyBlocks(
  calendars: Record<string, { busy?: { start: string; end: string }[] }>,
  calendarIds: string[]
): BusyBlock[] {
  const blocks: BusyBlock[] = [];

  for (const calId of calendarIds) {
    const busy = calendars[calId]?.busy ?? [];
    for (const b of busy) {
      blocks.push({
        start: new Date(b.start),
        end: new Date(b.end),
      });
    }
  }

  return blocks;
}
