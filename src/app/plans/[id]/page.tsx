import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getPlanWithParticipants } from "@/lib/plans/service";
import { getLatestPlanResults } from "@/lib/plans/results";
import { ParticipantList } from "@/components/ParticipantList";
import { PlanDashboard } from "@/components/PlanDashboard";
import { VotePanel } from "@/components/VotePanel";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  const { id } = await params;
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

  const results = await getLatestPlanResults(id);
  const showVoting = results !== null && data.plan.status === "voting";

  return (
    <div className="space-y-6 pb-8">
      {isOrganizer ? (
        <PlanDashboard
          planId={data.plan.id}
          title={data.plan.title}
          city={data.plan.city}
          status={data.plan.status}
          participants={data.participants}
          hasResults={showVoting}
        />
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{data.plan.title}</h1>
            <p className="text-muted">{data.plan.city}</p>
          </div>
          {showVoting ? (
            <VotePanel planId={data.plan.id} />
          ) : (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted text-center">
              Waiting for the organizer to generate hangout options. Check back soon!
            </div>
          )}
        </div>
      )}

      <section>
        <h2 className="font-medium mb-2">Participants</h2>
        <ParticipantList participants={data.participants} />
      </section>
    </div>
  );
}
