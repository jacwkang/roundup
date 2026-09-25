// M1 intentionally has no model or reservation tools. Durable messages form the M2 context boundary.
export function makeReply(text: string, introduced: boolean): string {
  if (!/\bara\b/i.test(text)) return "";
  const intro = introduced ? "" : "Hi, I'm Ara, your group's AI hangout assistant in development. I store messages in this pilot chat for conversation context. ";
  if (/\b(book|resy|reservations?)\b/i.test(text)) {
    return `${intro}Messaging is connected, but I can't search or book restaurants yet. AI and Resy bookings are coming in M2.`;
  }
  return `${intro}I'm here! I can receive and reply in this group. Say “Ara, are you there?” to test the connection. Planning and bookings aren't enabled yet.`;
}
