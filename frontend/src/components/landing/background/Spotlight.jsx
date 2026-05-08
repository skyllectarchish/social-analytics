/**
 * Spotlight — soft pastel orbs that wash the page like daylight.
 * Bright airy creator-economy aesthetic (Beacons / Stan Store inspired).
 */
export default function Spotlight() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Top lavender wash */}
      <div
        className="absolute left-1/2 top-[-10%] h-[640px] w-[1100px]"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(196,181,253,0.45) 0%, rgba(237,233,254,0.20) 35%, transparent 70%)",
          filter: "blur(70px)",
          transform: "translate(-50%, 0)",
        }}
      />
      {/* Left pastel pink */}
      <div
        className="absolute -left-[10%] top-[14%] h-[520px] w-[520px]"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(251,207,232,0.42), transparent 70%)",
          filter: "blur(70px)",
        }}
      />
      {/* Right peach */}
      <div
        className="absolute -right-[10%] top-[22%] h-[520px] w-[520px]"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(254,215,170,0.38), transparent 70%)",
          filter: "blur(70px)",
        }}
      />
      {/* Bottom soft sky */}
      <div
        className="absolute left-[20%] bottom-[-12%] h-[440px] w-[640px]"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(219,234,254,0.40), transparent 70%)",
          filter: "blur(80px)",
        }}
      />
    </div>
  );
}
