"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PREF_TAGS = ["food", "live music", "outdoors", "evening only"];

export function PlanForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const inviteRaw = (form.get("inviteEmails") as string) ?? "";
    const inviteEmails = inviteRaw
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const body = {
      title: form.get("title"),
      city: form.get("city"),
      timezone: form.get("timezone") || "America/New_York",
      dateRangeStart: form.get("dateRangeStart"),
      dateRangeEnd: form.get("dateRangeEnd"),
      minDurationMinutes: Number(form.get("minDurationMinutes") ?? 120),
      inviteEmails,
      preferences: {
        tags: selectedTags,
        notes: form.get("notes") || undefined,
        eveningOnly: selectedTags.includes("evening only"),
      },
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

    router.push(`/plans/${data.planId}`);
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1">Plan title</label>
        <input
          name="title"
          required
          placeholder="Summer dinner with friends"
          className="w-full rounded-lg border border-border px-3 py-2 bg-card"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">City</label>
        <input
          name="city"
          required
          placeholder="New York, NY"
          className="w-full rounded-lg border border-border px-3 py-2 bg-card"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">From</label>
          <input
            name="dateRangeStart"
            type="date"
            required
            defaultValue={today}
            className="w-full rounded-lg border border-border px-3 py-2 bg-card"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">To</label>
          <input
            name="dateRangeEnd"
            type="date"
            required
            defaultValue={twoWeeks}
            className="w-full rounded-lg border border-border px-3 py-2 bg-card"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Min duration (minutes)</label>
          <input
            name="minDurationMinutes"
            type="number"
            defaultValue={120}
            min={30}
            className="w-full rounded-lg border border-border px-3 py-2 bg-card"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Timezone</label>
          <input
            name="timezone"
            defaultValue="America/New_York"
            className="w-full rounded-lg border border-border px-3 py-2 bg-card"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Invite emails</label>
        <textarea
          name="inviteEmails"
          required
          rows={3}
          placeholder="friend1@gmail.com, friend2@gmail.com"
          className="w-full rounded-lg border border-border px-3 py-2 bg-card"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Preferences</label>
        <div className="flex flex-wrap gap-2">
          {PREF_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`rounded-full px-3 py-1 text-sm border ${
                selectedTags.includes(tag)
                  ? "bg-accent text-white border-accent"
                  : "border-border text-muted"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes (optional)</label>
        <textarea
          name="notes"
          rows={2}
          placeholder="Looking for somewhere with outdoor seating..."
          className="w-full rounded-lg border border-border px-3 py-2 bg-card"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent py-3 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create plan & send invites"}
      </button>
    </form>
  );
}
