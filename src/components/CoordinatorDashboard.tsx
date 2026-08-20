"use client";

import { useCallback, useEffect, useState } from "react";
import { ShareLinkCard } from "@/components/ShareLinkCard";
import { VotePanel } from "@/components/VotePanel";

interface ParticipantRow {
  id: string;
  email: string;
  status: string;
  preferencesJson?: string | null;
}

interface CoordinatorDashboardProps {
  planId: string;
  title: string;
  city: string;
  status: string;
  inviteUrl: string;
  participants: ParticipantRow[];
}

export function CoordinatorDashboard({
  planId,
  title,
  city,
  status,
  inviteUrl,
  participants: initialParticipants,
}: CoordinatorDashboardProps) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState(status);

  const connected = participants.filter((p) => p.status === "connected");

  const refreshPlan = useCallback(async () => {
    const res = await fetch(`/api/plans/${planId}`);
    if (res.ok) {
      const data = await res.json();
      setParticipants(data.participants);
      setPlanStatus(data.plan.status);
    }
  }, [planId]);

  useEffect(() => {
    if (planStatus === "collecting") {
      const interval = setInterval(refreshPlan, 5000);
      return () => clearInterval(interval);
    }
  }, [planStatus, refreshPlan]);

  async function generateOptions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/plans/${planId}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setPlanStatus("voting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          Coordinator
        </p>
        <h1 className="text-2xl font-bold mt-1">{title}</h1>
        <p className="text-muted">{city}</p>
      </div>

      <ShareLinkCard inviteUrl={inviteUrl} />

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-medium">
          {connected.length} friend{connected.length !== 1 ? "s" : ""} joined
        </p>
        {connected.length === 0 ? (
          <p className="text-sm text-muted">
            Waiting for people to open the link and sign in.
          </p>
        ) : (
          <ul className="space-y-2">
            {connected.map((p) => {
              let pref = "";
              try {
                pref = (JSON.parse(p.preferencesJson ?? "{}") as { notes?: string }).notes ?? "";
              } catch {
                /* ignore */
              }
              return (
                <li key={p.id} className="text-sm border-l-2 border-accent/40 pl-3">
                  <p className="font-medium">{p.email.split("@")[0]}</p>
                  {pref && <p className="text-muted text-xs mt-0.5">{pref}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {planStatus !== "voting" ? (
        <>
          <button
            onClick={generateOptions}
            disabled={loading || connected.length === 0}
            className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white disabled:opacity-50 touch-manipulation"
          >
            {loading ? "Generating..." : "Generate options"}
          </button>
          {connected.length === 0 && (
            <p className="text-xs text-muted text-center">
              At least one friend must join before generating.
            </p>
          )}
          <p className="text-xs text-muted text-center">
            Same invite link becomes the voting page for everyone.
          </p>
        </>
      ) : (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 text-center">
          Options are live — friends can vote at the invite link.
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 p-3">
          {error}
        </p>
      )}

      {planStatus === "voting" && <VotePanel planId={planId} />}
    </div>
  );
}
