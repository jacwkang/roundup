"use client";

import { useState } from "react";
import Link from "next/link";

interface PlanDashboardProps {
  planId: string;
  title: string;
  city: string;
  status: string;
  participants: Array<{ id: string; email: string; status: string }>;
}

export function PlanDashboard({
  planId,
  title,
  city,
  status,
  participants,
}: PlanDashboardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [slots, setSlots] = useState<Array<{ start: string; end: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  async function runStep(
    name: string,
    url: string,
    onSuccess?: (data: unknown) => void
  ) {
    setLoading(name);
    setError(null);
    setStep(name);

    const res = await fetch(url, { method: "POST" });
    const data = await res.json();
    setLoading(null);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    onSuccess?.(data);
  }

  async function findTimes() {
    await runStep("availability", `/api/plans/${planId}/compute-availability`, (data) => {
      const d = data as { slots: Array<{ start: string; end: string }> };
      setSlots(d.slots ?? []);
    });
  }

  async function runFullPipeline() {
    setLoading("pipeline");
    setError(null);

    try {
      const availRes = await fetch(`/api/plans/${planId}/compute-availability`, {
        method: "POST",
      });
      const availData = await availRes.json();
      if (!availRes.ok) throw new Error(availData.error ?? "Availability failed");
      setSlots(availData.slots ?? []);

      const discoveryRes = await fetch(`/api/plans/${planId}/discover-activities`, {
        method: "POST",
      });
      if (!discoveryRes.ok) {
        const d = await discoveryRes.json();
        throw new Error(d.error ?? "Discovery failed");
      }

      const reservRes = await fetch(`/api/plans/${planId}/check-reservations`, {
        method: "POST",
      });
      if (!reservRes.ok) {
        const d = await reservRes.json();
        throw new Error(d.error ?? "Reservation check failed");
      }

      const suggestRes = await fetch(`/api/plans/${planId}/suggest`, { method: "POST" });
      const suggestData = await suggestRes.json();
      if (!suggestRes.ok) throw new Error(suggestData.error ?? "Suggestion failed");

      sessionStorage.setItem(`suggestions-${planId}`, JSON.stringify(suggestData));
      window.location.href = `/plans/${planId}/review`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pipeline failed");
    } finally {
      setLoading(null);
    }
  }

  const connectedCount = participants.filter((p) => p.status === "connected").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted">{city} · {status}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <p className="text-sm font-medium">
          {connectedCount} of {participants.length} friends connected
        </p>
        {connectedCount < participants.length && (
          <p className="text-xs text-muted">
            Waiting for everyone to connect their calendar via the invite email.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={findTimes}
          disabled={!!loading}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-card disabled:opacity-50"
        >
          {loading === "availability" ? "Finding times..." : "Find mutual free times"}
        </button>
        <button
          onClick={runFullPipeline}
          disabled={!!loading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {loading === "pipeline" ? "Running..." : "Find times & generate suggestions"}
        </button>
        {slots.length > 0 && (
          <Link
            href={`/plans/${planId}/review`}
            className="rounded-lg border border-accent px-4 py-2 text-sm text-accent"
          >
            Review suggestions
          </Link>
        )}
      </div>

      {step && !error && loading === null && slots.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-medium">Free time slots found</h2>
          <ul className="space-y-1 text-sm text-muted">
            {slots.map((s, i) => (
              <li key={i}>
                {new Date(s.start).toLocaleString()} – {new Date(s.end).toLocaleTimeString()}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 p-3">
          {error}
        </p>
      )}
    </div>
  );
}
