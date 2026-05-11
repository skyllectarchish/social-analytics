import { useSyncInsights } from "../../hooks/useInsights";

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

export default function SyncButton() {
  const { syncing, synced, trigger } = useSyncInsights();

  return (
    <button
      onClick={trigger}
      disabled={syncing}
      className={`btn-magnetic flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
        synced
          ? "bg-emerald-100 text-emerald-700"
          : "btn-primary-glow text-white"
      }`}
      style={{ opacity: syncing ? 0.75 : 1 }}
    >
      {syncing ? <SpinnerIcon /> : <RefreshIcon />}
      {syncing ? "Syncing…" : synced ? "Synced!" : "Sync data"}
    </button>
  );
}
