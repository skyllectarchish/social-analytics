import { useEffect, useRef } from "react";

export default function MouseFollowGlow() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currX = targetX;
    let currY = targetY;

    const onMove = (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
    };

    const tick = () => {
      currX += (targetX - currX) * 0.08;
      currY += (targetY - currY) * 0.08;
      el.style.transform = `translate3d(${currX - 320}px, ${currY - 320}px, 0)`;
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove);
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-hidden
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 -z-10 h-[640px] w-[640px] rounded-full opacity-40"
      style={{
        background:
          "radial-gradient(circle at center, rgba(167,139,250,0.35), rgba(244,114,182,0.18) 35%, transparent 65%)",
        filter: "blur(40px)",
      }}
    />
  );
}
