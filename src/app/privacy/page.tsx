export default function PrivacyPage() {
  return (
    <article className="space-y-6 max-w-xl leading-relaxed">
      <h1 className="text-3xl font-semibold">Ara pilot privacy</h1>
      <p>Ara receives messages through Sendblue in groups approved by the pilot operator. It stores text messages, sender handles, chat and message identifiers, timestamps, and its replies in the operator’s database to preserve context and avoid duplicate replies.</p>
      <p>Only address Ara by name when you want a reply. Other text in the approved group is still stored as conversation context. Messages from before Ara joined are not imported.</p>
      <p>This messaging pilot does not connect Google accounts, read calendars, send messages to an AI model, or make reservations. Sendblue processes messages as the messaging provider.</p>
      <p>Data remains in the pilot database until the operator deletes it. Ask your pilot organizer to stop processing the group or delete its stored history. Removing the group from the allowlist stops new processing; it does not erase previously stored data.</p>
      <p>Avoid sharing passwords, verification codes, payment details, or other secrets in the group chat.</p>
    </article>
  );
}
