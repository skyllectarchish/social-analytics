import { useMemo } from "react";
import { motion } from "framer-motion";

const COLORS = [
  "rgba(99, 102, 241, 0.45)",
  "rgba(167, 139, 250, 0.45)",
  "rgba(34, 211, 238, 0.40)",
  "rgba(236, 72, 153, 0.40)",
];

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export default function FloatingParticles({ count = 18 }) {
  const particles = useMemo(() => {
    const rand = seededRandom(42);
    return Array.from({ length: count }, (_, i) => {
      const size = 5 + rand() * 12;
      return {
        id: i,
        size,
        left: rand() * 100,
        top: rand() * 100,
        delay: rand() * 6,
        duration: 10 + rand() * 9,
        drift: 14 + rand() * 26,
        color: COLORS[i % COLORS.length],
      };
    });
  }, [count]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 4}px ${p.color}`,
            filter: "blur(0.5px)",
          }}
          animate={{
            y: [0, -p.drift, 0],
            x: [0, p.drift / 2, 0],
            opacity: [0.25, 0.65, 0.25],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
