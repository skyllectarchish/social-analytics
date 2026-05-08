export default function GradientMesh() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      {/* Bright airy canvas with soft pastel gradient blobs */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(196,181,253,0.32), transparent 60%), radial-gradient(50% 50% at 100% 100%, rgba(251,207,232,0.28), transparent 60%), radial-gradient(50% 50% at 0% 80%, rgba(219,234,254,0.30), transparent 60%), linear-gradient(180deg, #fafafb 0%, #f7f6fb 55%, #fafafb 100%)",
        }}
      />
      {/* Pastel aurora */}
      <div className="aurora-bg" />
      {/* Light grain */}
      <div className="noise-light" />
      {/* Top hairline */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/60 to-transparent" />
    </div>
  );
}
