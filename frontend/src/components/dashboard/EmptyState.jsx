export default function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="glass-subtle rounded-2xl p-10 flex flex-col items-center text-center gap-4">
      {icon && (
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-100 text-slate-500">
          {icon}
        </div>
      )}
      <div>
        <p className="font-display text-base font-semibold text-[#0a0e27] mb-1">{title}</p>
        {description && <p className="text-sm text-slate-500 max-w-xs">{description}</p>}
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="btn-magnetic btn-primary-glow px-5 py-2 rounded-xl text-sm font-semibold text-white mt-1"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
