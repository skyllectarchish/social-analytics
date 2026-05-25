import Navbar from "./Navbar";

// Legacy light layout used only by InstaDashboardPage. Intentionally does NOT
// apply the `.lumen-landing` scoping class — that class is reserved for the
// marketing landing surface and brings its own font/color tokens that don't
// belong inside the app shell.
export default function Layout({ children }) {
  return (
    <div className="min-h-screen" style={{ background: "#fafafb" }}>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
