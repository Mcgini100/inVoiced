import { redirect } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { getRepo, getSession } from "@/server/context";
import { getDashboard } from "@/server/services/ledger";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  const initial = await getDashboard({ repo: getRepo().forBusiness(session.businessId), userId: session.userId });
  return <Dashboard initial={initial} />;
}
