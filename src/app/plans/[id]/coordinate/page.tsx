import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getPlanWithParticipants } from "@/lib/plans/service";
import { getJoinUrl } from "@/lib/plans/share";
import { CoordinatorDashboard } from "@/components/CoordinatorDashboard";

export default async function CoordinatePage({
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

  if (data.plan.organizerId !== session.user.id) {
    redirect(`/join/${data.plan.shareToken}`);
  }

  return (
    <CoordinatorDashboard
      planId={data.plan.id}
      title={data.plan.title}
      city={data.plan.city}
      status={data.plan.status}
      inviteUrl={getJoinUrl(data.plan.shareToken)}
      participants={data.participants}
    />
  );
}
