import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PlanForm } from "@/components/PlanForm";

export default async function NewPlanPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New hangout plan</h1>
        <p className="text-muted">Invite friends and we&apos;ll find a time that works.</p>
      </div>
      <PlanForm />
    </div>
  );
}
