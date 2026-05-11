import MediaCard from "./MediaCard";

export default function MediaGrid({ items, total, page, pageSize, onPageChange }) {
  const totalPages = Math.ceil(total / pageSize);

  if (!items.length) {
    return (
      <div className="text-center py-20 text-slate-400">
        No media found.
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((media) => (
          <MediaCard key={media.ig_media_id} media={media} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
            className="chip-soft px-4 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-sm px-3 text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
            className="chip-soft px-4 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
