"use client";

import { useCallback, useEffect, useState } from "react";

interface VotableOptionDisplay {
  id: string;
  label: string;
  description?: string;
  slotStart?: string;
  slotEnd?: string;
  activityType?: string;
  bookUrl?: string;
  eventUrl?: string;
  reservationTimes?: string[];
  voteCount: number;
  userVoted: boolean;
}

interface VotePanelProps {
  planId: string;
}

export function VotePanel({ planId }: VotePanelProps) {
  const [options, setOptions] = useState<VotableOptionDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const loadResults = useCallback(async () => {
    const res = await fetch(`/api/plans/${planId}/results`);
    const data = await res.json();
    if (data.results) {
      setOptions(data.results.options);
      setGeneratedAt(data.results.generatedAt);
    }
    setLoading(false);
  }, [planId]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  async function handleVote(optionId: string) {
    setVotingId(optionId);
    const res = await fetch(`/api/plans/${planId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    });
    if (res.ok) {
      await loadResults();
    }
    setVotingId(null);
  }

  if (loading) {
    return (
      <p className="text-sm text-muted text-center py-8">Loading options...</p>
    );
  }

  if (options.length === 0) {
    return null;
  }

  const leader = options[0];

  return (
    <section className="space-y-4">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold">Pick your favorite</h2>
        <p className="text-sm text-muted">
          Tap to vote — you can choose more than one
        </p>
        {generatedAt && (
          <p className="text-xs text-muted">
            Updated {new Date(generatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {leader && leader.voteCount > 0 && (
        <div className="rounded-xl border-2 border-accent/30 bg-accent/5 p-4 text-center">
          <p className="text-xs font-medium text-accent uppercase tracking-wide">
            Currently leading
          </p>
          <p className="font-semibold mt-1">{leader.label}</p>
          <p className="text-sm text-muted">{leader.voteCount} vote{leader.voteCount !== 1 ? "s" : ""}</p>
        </div>
      )}

      <ul className="space-y-3">
        {options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => handleVote(option.id)}
              disabled={votingId === option.id}
              className={`w-full text-left rounded-xl border-2 p-4 transition-colors touch-manipulation min-h-[72px] ${
                option.userVoted
                  ? "border-accent bg-accent/10"
                  : "border-border bg-card active:bg-accent/5"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium leading-snug">{option.label}</p>
                  {option.description && (
                    <p className="text-sm text-muted mt-1 line-clamp-2">
                      {option.description}
                    </p>
                  )}
                  {option.reservationTimes && option.reservationTimes.length > 0 && (
                    <p className="text-xs text-muted mt-2">
                      Tables: {option.reservationTimes.join(", ")}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {option.bookUrl && (
                      <a
                        href={option.bookUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-medium text-accent underline"
                      >
                        Book reservation
                      </a>
                    )}
                    {option.eventUrl && (
                      <a
                        href={option.eventUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-medium text-accent underline"
                      >
                        Event details
                      </a>
                    )}
                  </div>
                </div>
                <div
                  className={`shrink-0 flex flex-col items-center justify-center rounded-full w-12 h-12 ${
                    option.userVoted ? "bg-accent text-white" : "bg-border/50 text-foreground"
                  }`}
                >
                  <span className="text-lg font-bold">{option.voteCount}</span>
                  <span className="text-[10px] uppercase">
                    {option.userVoted ? "✓" : "vote"}
                  </span>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
