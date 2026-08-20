"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { VotePanel } from "@/components/VotePanel";

interface JoinPageClientProps {
  shareToken: string;
}

interface JoinState {
  plan: {
    id: string;
    title: string;
    city: string;
    status: string;
  };
  joined: boolean;
  participantCount: number;
  isOrganizer?: boolean;
}

export function JoinPageClient({ shareToken }: JoinPageClientProps) {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const [joinState, setJoinState] = useState<JoinState | null>(null);
  const [preferences, setPreferences] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJoin = useCallback(async () => {
    const res = await fetch(`/api/join/${shareToken}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Invalid link");
      setLoading(false);
      return;
    }
    setJoinState({
      plan: data.plan,
      joined: data.joined,
      participantCount: data.participantCount,
      isOrganizer: data.isOrganizer,
    });
    if (data.isOrganizer) {
      router.replace(`/plans/${data.plan.id}/coordinate`);
    }
    setLoading(false);
  }, [shareToken, router]);

  useEffect(() => {
    loadJoin();
  }, [loadJoin]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/join/${shareToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to join");
      return;
    }

    await loadJoin();
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-muted text-sm">Loading...</div>
    );
  }

  if (error && !joinState) {
    return (
      <div className="text-center py-16 text-red-600 text-sm">{error}</div>
    );
  }

  if (!joinState) return null;

  const { plan } = joinState;

  if (plan.status === "voting") {
    return (
      <div className="space-y-6 pb-8">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">{plan.title}</h1>
          <p className="text-sm text-muted">{plan.city}</p>
        </div>
        <VotePanel planId={plan.id} />
      </div>
    );
  }

  if (authStatus === "unauthenticated") {
    return (
      <div className="space-y-6 py-8 text-center">
        <div className="space-y-2">
          <h1 className="text-xl font-bold">{plan.title}</h1>
          <p className="text-sm text-muted">{plan.city}</p>
          <p className="text-sm text-muted pt-2">
            Sign in with Google to share your calendar availability and preferences.
          </p>
        </div>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: `/join/${shareToken}` })}
          className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white touch-manipulation"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  if (joinState.joined) {
    return (
      <div className="space-y-4 py-8 text-center">
        <h1 className="text-xl font-bold">{plan.title}</h1>
        <div className="rounded-xl border border-border bg-card p-6 space-y-2">
          <p className="text-2xl">✓</p>
          <p className="font-medium">You&apos;re in!</p>
          <p className="text-sm text-muted">
            {joinState.participantCount} friend
            {joinState.participantCount !== 1 ? "s" : ""} joined so far.
            The organizer will generate options soon — keep this link handy to vote.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <div className="text-center space-y-1">
        <h1 className="text-xl font-bold">{plan.title}</h1>
        <p className="text-sm text-muted">{plan.city}</p>
      </div>

      <form onSubmit={handleJoin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            What would you like to do? Any availability notes?
          </label>
          <textarea
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            rows={4}
            placeholder="Free most weekends, love Italian food, prefer evenings after 6..."
            className="w-full rounded-xl border border-border px-3 py-3 bg-card text-base resize-none"
          />
        </div>

        <p className="text-xs text-muted">
          We&apos;ll also read your Google Calendar free/busy to find times that work.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white disabled:opacity-50 touch-manipulation"
        >
          {submitting ? "Joining..." : "Join hangout"}
        </button>
      </form>
    </div>
  );
}
