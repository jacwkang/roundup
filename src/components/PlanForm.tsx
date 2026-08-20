"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlanForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const body = {
      title: form.get("title"),
      city: form.get("city"),
      timezone: form.get("timezone") || "America/New_York",
      dateRangeStart: form.get("dateRangeStart"),
      dateRangeEnd: form.get("dateRangeEnd"),
      minDurationMinutes: Number(form.get("minDurationMinutes") ?? 120),
    };

    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error?.message ?? JSON.stringify(data.error) ?? "Failed to create plan");
      return;
    }

    router.push(`/plans/${data.planId}/coordinate`);
  }

  const today = new Date().toISOString().split("T")[0];
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1">Plan title</label>
        <input
          name="title"
          required
          placeholder="Summer dinner with friends"
          className="w-full rounded-xl border border-border px-3 py-3 bg-card text-base"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">City</label>
        <input
          name="city"
          required
          placeholder="New York, NY"
          className="w-full rounded-xl border border-border px-3 py-3 bg-card text-base"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">From</label>
          <input
            name="dateRangeStart"
            type="date"
            required
            defaultValue={today}
            className="w-full rounded-xl border border-border px-3 py-3 bg-card"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">To</label>
          <input
            name="dateRangeEnd"
            type="date"
            required
            defaultValue={twoWeeks}
            className="w-full rounded-xl border border-border px-3 py-3 bg-card"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Min duration (min)</label>
          <input
            name="minDurationMinutes"
            type="number"
            defaultValue={120}
            min={30}
            className="w-full rounded-xl border border-border px-3 py-3 bg-card"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Timezone</label>
          <input
            name="timezone"
            defaultValue="America/New_York"
            className="w-full rounded-xl border border-border px-3 py-3 bg-card"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white hover:bg-accent-hover disabled:opacity-50 touch-manipulation"
      >
        {loading ? "Creating..." : "Create plan"}
      </button>
    </form>
  );
}
