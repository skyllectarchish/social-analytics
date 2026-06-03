import { Loader2 } from "lucide-react";

// Full-area loader shown while a page's initial fetch resolves.
export function PageLoading() {
  return (
    <div className="grid h-[60vh] place-items-center">
      <Loader2 className="h-7 w-7 animate-spin text-violet" />
    </div>
  );
}

// Centered empty-state used inside a card/chart when a dataset has no rows.
export function CardEmpty({ label }: { label: string }) {
  return (
    <div className="grid h-full min-h-[8rem] place-items-center px-4 text-center text-sm text-foreground/50">
      {label}
    </div>
  );
}
