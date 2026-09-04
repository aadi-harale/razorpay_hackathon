import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DEMO_EMAIL } from "@/lib/config";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  if (await getSession()) redirect("/overview");
  return <LoginForm defaultEmail={DEMO_EMAIL} />;
}
