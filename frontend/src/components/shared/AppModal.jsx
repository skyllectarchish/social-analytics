import Modal from "react-bootstrap/Modal";
import { X } from "lucide-react";

/**
 * Shared modal shell built on react-bootstrap's <Modal>.
 *
 * react-bootstrap gives us the accessibility behaviour the hand-rolled
 * Framer-Motion dialogs were missing for free:
 *   - focus trap (enforceFocus) + focus restoration on close (restoreFocus)
 *   - Escape-to-close (keyboard) and backdrop-click-to-close
 *   - body scroll lock while open
 *   - role="dialog" / aria-modal / labelled-by wiring
 *   - a single, predictable stacking context (z-index 1055) that sits above
 *     every Tailwind-layered surface, so modals can never be obscured.
 *
 * Bootstrap is loaded into a *lower* cascade layer (see index.css), so the
 * Tailwind utility classes we pass via `contentClassName` win every conflict
 * and the dialog keeps the app's frosted-white, soft-shadow look.
 *
 * Props:
 *   open               whether the modal is shown
 *   onClose            called on Escape / backdrop click / close button
 *   title              header title (also wired up as the aria-label)
 *   subtitle           muted one-liner under the title
 *   icon               lucide icon rendered in a gradient chip in the header
 *   size               "sm" | "lg" | "xl" (react-bootstrap width)
 *   fullscreenSmDown   go edge-to-edge full screen on phones (< 576px)
 *   initialFocusRef    element focused once the open animation settles
 *   hideHeader         render children only (custom header inside body)
 *   bodyClassName      classes for the scrollable body wrapper
 *   className          extra classes for the modal content shell
 */
export default function AppModal({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  size,
  fullscreenSmDown = false,
  staticBackdrop = false,
  initialFocusRef,
  hideHeader = false,
  className = "",
  bodyClassName = "",
  children,
}) {
  const titleId = "app-modal-title";
  return (
    <Modal
      show={open}
      onHide={onClose}
      centered
      size={size}
      fullscreen={fullscreenSmDown ? "sm-down" : undefined}
      backdrop={staticBackdrop ? "static" : true}
      keyboard={!staticBackdrop}
      backdropClassName="app-modal-backdrop"
      contentClassName={`app-modal-content flex flex-col bg-white border-0 rounded-2xl shadow-2xl overflow-hidden ${className}`}
      aria-labelledby={title ? titleId : undefined}
      onEntered={() => initialFocusRef?.current?.focus?.()}
    >
      {!hideHeader && (title || Icon) && (
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <span
                className="grid place-items-center w-8 h-8 rounded-xl shrink-0"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(139,92,246,0.16), rgba(236,72,153,0.10))",
                  color: "#7c3aed",
                }}
              >
                <Icon size={15} strokeWidth={2.2} />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h2
                  id={titleId}
                  className="font-display text-[15px] font-semibold text-slate-900 leading-tight truncate"
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid place-items-center w-8 h-8 rounded-full text-slate-500 bg-slate-100 hover:bg-slate-200 hover:text-slate-700 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <X size={15} />
          </button>
        </header>
      )}
      <div className={`min-h-0 overflow-y-auto ${bodyClassName}`}>{children}</div>
    </Modal>
  );
}
