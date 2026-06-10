// Centered empty-state used inside a card/chart when a dataset has no rows.
export function CardEmpty({ label }: { label: string }) {
  return (
    <div className="grid h-full min-h-[8rem] place-items-center px-4 text-center text-sm text-foreground/50">
      {label}
    </div>
  );
}
