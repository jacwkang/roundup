"use client";

interface Participant {
  id: string;
  email: string;
  status: string;
}

export function ParticipantList({ participants }: { participants: Participant[] }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {participants.map((p) => (
        <li key={p.id} className="flex items-center justify-between px-4 py-3">
          <span className="text-sm">{p.email}</span>
          <span
            className={`text-xs rounded-full px-2 py-0.5 ${
              p.status === "connected"
                ? "bg-green-100 text-green-800"
                : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {p.status === "connected" ? "Connected" : "Invited"}
          </span>
        </li>
      ))}
    </ul>
  );
}
