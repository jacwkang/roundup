import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getPlanWithParticipants } from "@/lib/plans/service";
import { ParticipantList } from "@/components/ParticipantList";
import { PlanDashboard } from "@/components/PlanDashboard";

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  const { id } = await params;
  const { sent } = await searchParams;
  const data = await getPlanWithParticipants(id);

  if (!data) {
    notFound();
  }

  const isOrganizer = data.plan.organizerId === session.user.id;
  const isParticipant = data.participants.some(
    (p) => p.userId === session.user.id
  );

  if (!isOrganizer && !isParticipant) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      {sent === "1" && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Proposal email sent to all participants!
        </div>
      )}

      {isOrganizer ? (
        <PlanDashboard
          planId={data.plan.id}
          title={data.plan.title}
          city={data.plan.city}
          status={data.plan.status}
          participants={data.participants}
        />
      ) : (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">{data.plan.title}</h1>
          <p className="text-muted">
            You&apos;re connected. Waiting for the organizer to find times and send a proposal.
          </p>
        </div>
      )}

      <section>
        <h2 className="font-medium mb-2">Participants</h2>
        <ParticipantList participants={data.participants} />
      </section>
    </div>
  );
}
