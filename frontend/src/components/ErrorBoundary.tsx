import { Component, type ReactNode } from "react";

// Catches unhandled render errors anywhere below it so a bad chart payload
// degrades to a reload prompt instead of a blank white screen.
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Unhandled render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-deep">
              Something broke
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              The page hit an unexpected error
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-foreground/55">
              Your data is fine — this is a rendering problem on our side. Reloading usually fixes it.
            </p>
            <button onClick={() => window.location.reload()} className="btn-glow mt-6 inline-flex">
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
