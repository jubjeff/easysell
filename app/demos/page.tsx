import { Suspense } from "react";
import DemosClient from "./DemosClient";

export const dynamic = "force-dynamic";

export default function DemosPage() {
  return (
    <Suspense
      fallback={<p className="font-mono text-sm text-dim animate-pulse">carregando demos…</p>}
    >
      <DemosClient />
    </Suspense>
  );
}
