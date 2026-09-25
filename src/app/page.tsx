export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="space-y-5">
        <p className="text-sm font-medium text-accent">Meet Ara</p>
        <h1 className="text-5xl font-semibold tracking-tight leading-tight">Good plans start<br />in the group chat.</h1>
        <p className="max-w-xl text-lg leading-relaxed text-muted">A companion for getting your friends together, right where you already talk.</p>
      </section>
      <section className="rounded-2xl border border-border bg-card p-8 space-y-5">
        <h2 className="text-xl font-semibold">The first step: say hello.</h2>
        <p className="text-muted leading-relaxed">Ara is in an early messaging pilot. Once your group is connected, address Ara by name to check that it can hear you.</p>
        <div className="rounded-xl bg-background p-5 space-y-3">
          <p className="text-sm font-medium">You</p>
          <p>Ara, are you there?</p>
          <p className="text-sm font-medium text-accent pt-3">Ara</p>
          <p>I’m here! I can receive and reply in this group.</p>
        </div>
        <p className="text-sm text-muted">Planning, AI conversations, and restaurant bookings are coming next. This pilot only tests messaging.</p>
      </section>
      <p className="text-sm text-muted">Joining a pilot? Ask your organizer for Ara’s number and the connected group. No app or sign-in needed.</p>
    </div>
  );
}
