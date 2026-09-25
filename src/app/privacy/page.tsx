export default function PrivacyPage() {
  return (
    <article className="space-y-6 max-w-xl leading-relaxed">
      <h1 className="text-3xl font-semibold">Ara pilot privacy</h1>
      <p>Ara receives messages through Sendblue in groups approved by the pilot operator. It stores text messages, sender handles, chat and message identifiers, timestamps, and its replies in the operator’s database to preserve context and avoid duplicate replies.</p>
      <p>Address Ara by name to start a conversation. When AI mode is enabled, Ara also handles relevant follow-ups during an active planning conversation. Other text in the approved group is still stored as context. Messages from before Ara joined are not imported.</p>
      <p>Sendblue processes messages. When the operator enables AI mode, recent group text and Ara’s replies are sent to OpenAI to interpret requests. Sender phone numbers are replaced with participant aliases in these requests; personal information written into messages remains part of their text. Ara requests that model responses not be stored through the Responses API, subject to the provider’s applicable data policies.</p>
      <p>If the designated owner privately connects Resy and the operator enables bookings, Ara can use that account after the owner approves the exact table and terms. Resy credentials and private booking tokens are encrypted in the operator’s database and excluded from model requests and group replies. No Google account or calendar access is used.</p>
      <p>When browser fallback is enabled, Steel hosts an isolated browser and processes its page content and authenticated session. Browser login state is encrypted locally between sessions. Limited redacted page summaries, and optionally masked screenshots, may be sent to OpenAI when ordinary extraction fails. Ara does not attach to your personal browser.</p>
      <p>Data remains in the pilot database until the operator deletes it. Ask your pilot organizer to stop processing the group or delete its stored history. Removing the group from the allowlist stops new processing; it does not erase previously stored data.</p>
      <p>Avoid sharing passwords, verification codes, payment details, or other secrets in the group chat.</p>
    </article>
  );
}
