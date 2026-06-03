import { useCallback, useState } from "react";

// Lightweight sync used by the (mock-driven) sub-pages so the Sync button in
// the shared layout stays interactive. Simulates a short refresh.
export function useSync() {
  const [syncing, setSyncing] = useState(false);
  const sync = useCallback(() => {
    setSyncing(true);
    const t = setTimeout(() => setSyncing(false), 900);
    return () => clearTimeout(t);
  }, []);
  return { syncing, sync };
}
