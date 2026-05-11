import Navbar from "./Navbar";

export default function Layout({ children }) {
  return (
    <div className="lumen-landing min-h-screen" style={{ background: "#fafafb" }}>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
