import { requireSession } from "@/lib/auth";
import { Shell } from "@/components/Shell";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return <Shell>{children}</Shell>;
}
