"use client";

import { useState } from "react";
import { VotePanel } from "@/components/VotePanel";

interface PlanDashboardProps {
  planId: string;
  title: string;
  city: string;
  status: string;
  participants: Array<{ id: string; email: string; status: string }>;
  hasResults: boolean;
}

export function PlanDashboard({
  planId,
  title,
  city,
  status,
  participants,
  hasResults: initialHasResults,
}: PlanDashboardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasResults, setHasResults] = useState(initialHasResults);
  const [refreshKey, setRefreshKey] = useState(0);

  const connectedCount = participants.filter((p) => p.status === "connected").length;
  const totalPeople = connectedCount + 1; // organizer + connected invitees

  async function generateResults() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/plans/${planId}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setHasResults(true);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted">{city} · {status}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <p className="text-sm font-medium">
          {connectedCount} of {participants.length} friends connected
        </p>
        <p className="text-xs text-muted">
          Share the invite link in your group chat. When enough people have joined,
          tap generate — you don&apos;t need to wait for everyone.
        </p>
        <p className="text-xs font-medium text-foreground">
          {totalPeople} {totalPeople === 1 ? "person" : "people"} will be included in scheduling
        </p>
      </div>

      <button
        onClick={generateResults}
        disabled={loading || totalPeople < 1}
        className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white hover:bg-accent-hover disabled:opacity-50 touch-manipulation"
      >
        {loading ? "Generating..." : hasResults ? "Regenerate results" : "Generate results"}
      </button>

      {error && (
        <p className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 p-3">
          {error}
        </p>
      )}

      {hasResults && (
        <VotePanel key={refreshKey} planId={planId} />
      )}
    </div>
  );
}
