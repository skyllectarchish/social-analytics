import { Component } from "react";

/**
 * Catches uncaught render errors anywhere below it and shows a recoverable
 * fallback UI instead of a blank white screen. Mounted once at the root so
 * a chart throwing on bad data can't take down the whole app.
 *
 * React doesn't provide a hook equivalent for error boundaries yet, so this
 * is the rare place we still need a class component.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof window !== "undefined" && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary]", error, info?.componentStack);
    }
  }

  handleReload = () => {
    // Hard reload to recover from a corrupted client state. Cheap, predictable.
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div
          className="min-h-screen flex items-center justify-center px-6"
          style={{ background: "#fafafb" }}
          role="alert"
        >
          <div className="max-w-sm text-center">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-rose-600 mb-2">
              Something went wrong
            </p>
            <h1 className="font-display text-2xl font-semibold text-[#0a0e27] mb-2">
              The page hit an unexpected error
            </h1>
            <p className="text-sm text-slate-500 mb-6">
              Try reloading. If the issue keeps happening, sign out and back in.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-block px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
