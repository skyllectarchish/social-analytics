import { lazy, Suspense } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./hooks/useAuth";
import CallbackPage from "./pages/CallbackPage";
import ConnectInstagramPage from "./pages/ConnectInstagramPage";
import DashboardPage from "./pages/DashboardPage";
import InstaDashboardPage from "./pages/InstaDashboardPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ContentLabPage from "./pages/ContentLabPage";
import ReelsStudioPage from "./pages/ReelsStudioPage";
import AudienceDNAPage from "./pages/AudienceDNAPage";
import CompetitorsPage from "./pages/CompetitorsPage";

// Lazy-load the Copilot route — pulls react-markdown + plugins (~150 KB
// gzipped) into a separate chunk so non-Copilot pages stay lean.
const AICopilotPage = lazy(() => import("./pages/AICopilotPage"));

function Splash() {
  // Centered loader shown while AuthProvider's initial /auth/me round-trip
  // resolves. Better than the previous `return null` which left a white
  // screen if /auth/me was slow.
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#fafafb" }}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="w-8 h-8 rounded-full border-2 border-violet-200 border-t-violet-600 animate-spin" />
    </div>
  );
}

function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "#fafafb" }}
    >
      <div className="max-w-sm text-center">
        <p className="text-xs font-semibold tracking-[0.18em] uppercase text-violet-600 mb-2">
          404
        </p>
        <h1 className="font-display text-2xl font-semibold text-[#0a0e27] mb-2">
          We couldn't find that page
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          The link may be out of date, or the page may have moved.
        </p>
        <a
          href={user ? "/dashboard" : "/"}
          className="inline-block px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
        >
          {user ? "Back to dashboard" : "Back to home"}
        </a>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) {
    // Preserve the originally-requested URL so /login can send the user back
    // after they authenticate, instead of always landing on /dashboard.
    const here = location.pathname + location.search;
    const next = here.startsWith("/") && !here.startsWith("//") ? here : "/dashboard";
    const target = next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
    return <Navigate to={target} replace />;
  }
  return children;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
      <Route path="/connect" element={<ProtectedRoute><ConnectInstagramPage /></ProtectedRoute>} />
      <Route path="/auth/instagram/callback" element={<ProtectedRoute><CallbackPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/dashboard/content" element={<ProtectedRoute><ContentLabPage /></ProtectedRoute>} />
      <Route path="/dashboard/reels" element={<ProtectedRoute><ReelsStudioPage /></ProtectedRoute>} />
      <Route path="/dashboard/audience" element={<ProtectedRoute><AudienceDNAPage /></ProtectedRoute>} />
      <Route path="/dashboard/competitors" element={<ProtectedRoute><CompetitorsPage /></ProtectedRoute>} />
      <Route
        path="/dashboard/insightiq"
        element={
          <ProtectedRoute>
            <Suspense fallback={<Splash />}>
              <AICopilotPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route path="/insta-dashboard" element={<ProtectedRoute><InstaDashboardPage /></ProtectedRoute>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
