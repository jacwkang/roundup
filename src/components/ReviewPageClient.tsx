"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ReviewPageClientProps {
  planId: string;
  planTitle: string;
}

export function ReviewPageClient({ planId, planTitle }: ReviewPageClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [slots, setSlots] = useState<Array<{ start: string; end: string }>>([]);
  const [activities, setActivities] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem(`suggestions-${planId}`);
    if (stored) {
      const data = JSON.parse(stored);
      setEmailSubject(data.suggestions?.emailSubject ?? `Hangout: ${planTitle}`);
      setEmailBody(data.suggestions?.emailBodyMarkdown ?? "");
      setSlots(data.slots ?? data.suggestions?.rankedSlots ?? []);
      setActivities(data.suggestions?.activities ?? []);
    } else {
      fetch(`/api/plans/${planId}/suggest`, { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
          if (data.suggestions) {
            setEmailSubject(data.suggestions.emailSubject);
            setEmailBody(data.suggestions.emailBodyMarkdown);
            setSlots(data.slots ?? []);
            setActivities(data.suggestions.activities ?? []);
          }
        })
        .catch(() => setError("Failed to load suggestions"));
    }
  }, [planId, planTitle]);

  async function sendProposal() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/plans/${planId}/send-proposal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailSubject,
        emailBody,
        selectedSlots: slots.slice(0, 3),
        activities,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to send");
      return;
    }

    router.push(`/plans/${planId}?sent=1`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Review proposal</h1>
        <p className="text-muted">{planTitle}</p>
      </div>

      {activities.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="font-medium">Suggested activities</h2>
          {activities.map((a, i) => (
            <div key={i} className="text-sm border-l-2 border-accent pl-3">
              <p className="font-medium">{String(a.title)}</p>
              <p className="text-muted">{String(a.why)}</p>
            </div>
          ))}
        </section>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Email subject</label>
        <input
          value={emailSubject}
          onChange={(e) => setEmailSubject(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 bg-card"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Email body</label>
        <textarea
          value={emailBody}
          onChange={(e) => setEmailBody(e.target.value)}
          rows={14}
          className="w-full rounded-lg border border-border px-3 py-2 bg-card font-mono text-sm"
        />
        <p className="text-xs text-muted mt-1">
          Use {"{respond_link_1}"}, {"{respond_link_2}"}, etc. for accept buttons.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={sendProposal}
          disabled={loading || !emailBody}
          className="rounded-lg bg-accent px-6 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send proposal email"}
        </button>
        <a
          href={`/plans/${planId}`}
          className="rounded-lg border border-border px-6 py-2 text-sm"
        >
          Back
        </a>
      </div>
    </div>
  );
}
