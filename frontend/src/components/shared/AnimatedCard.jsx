import { motion } from "framer-motion";

export default function AnimatedCard({
  children,
  delay = 0,
  className = "",
  onClick,
  hoverable = false,
  ...props
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
      transition={{ type: "spring", duration: 0.45, bounce: 0, delay }}
      className={`d-card ${hoverable ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
      whileHover={hoverable ? { y: -2, transition: { duration: 0.15 } } : undefined}
      whileTap={hoverable ? { scale: 0.985 } : undefined}
      {...props}
    >
      {children}
    </motion.div>
  );
}
