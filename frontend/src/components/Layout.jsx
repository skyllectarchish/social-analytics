import Navbar from "./Navbar";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen" style={{ background: "oklch(0.12 0.02 275)" }}>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
