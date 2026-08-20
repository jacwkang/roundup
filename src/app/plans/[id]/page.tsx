import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getPlanWithParticipants } from "@/lib/plans/service";

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

  if (data.plan.organizerId === session.user.id) {
    redirect(`/plans/${id}/coordinate`);
  }

  redirect(`/join/${data.plan.shareToken}`);
}
