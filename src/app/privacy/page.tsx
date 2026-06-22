export default function PrivacyPage() {
  return (
    <div className="prose prose-sm max-w-none space-y-4">
      <h1 className="text-2xl font-bold">Privacy</h1>
      <p>
        Hangout Planner reads your Google Calendar <strong>free/busy</strong> data
        only — we never access event titles, descriptions, or attendee lists.
      </p>
      <p>
        Proposal and invite emails are sent via Gmail on your behalf using the{" "}
        <code>gmail.send</code> scope. We store encrypted OAuth refresh tokens
        to maintain calendar access between sessions.
      </p>
      <p>
        Activity discovery uses Yelp, Ticketmaster, and Eventbrite APIs to suggest
        restaurants and events. Reservation availability checks are read-only;
        booking happens on Resy or OpenTable directly.
      </p>
    </div>
  );
}
