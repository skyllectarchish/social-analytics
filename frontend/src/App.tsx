import type { ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "./context/AuthContext";
import { PeriodComparatorProvider } from "./context/PeriodComparatorContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { useAuth } from "./hooks/useAuth";
import Landing from "./components/Landing";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ConnectInstagramPage from "./pages/ConnectInstagramPage";
import CallbackPage from "./pages/CallbackPage";
import DashboardPage from "./pages/DashboardPage";
import ContentLabPage from "./pages/ContentLabPage";
import ReelsStudioPage from "./pages/ReelsStudioPage";
import AudienceDNAPage from "./pages/AudienceDNAPage";
import CompetitorsPage from "./pages/CompetitorsPage";
import CopilotPage from "./pages/CopilotPage";
import MediaKitPage from "./pages/MediaKitPage";
import InboxPage from "./pages/InboxPage";
import StoriesPage from "./pages/StoriesPage";
import DMAutomationPage from "./pages/DMAutomationPage";
import PostsPage from "./pages/PostsPage";
import ImportPage from "./pages/ImportPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsOfServicePage from "./pages/TermsOfServicePage";

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background" role="status" aria-label="Loading">
      <Loader2 className="h-8 w-8 animate-spin text-violet" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) {
    const here = location.pathname + location.search;
    const next = here.startsWith("/") && !here.startsWith("//") ? here : "/dashboard";
    const target = next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
}

function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-deep">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
        <a href="/" className="btn-glow mt-6 inline-flex">Back home</a>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
      <Route path="/connect" element={<ProtectedRoute><ConnectInstagramPage /></ProtectedRoute>} />
      <Route path="/auth/instagram/callback" element={<ProtectedRoute><CallbackPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/dashboard/posts" element={<ProtectedRoute><PostsPage /></ProtectedRoute>} />
      <Route path="/dashboard/import" element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />
      <Route path="/dashboard/content" element={<ProtectedRoute><ContentLabPage /></ProtectedRoute>} />
      <Route path="/dashboard/reels" element={<ProtectedRoute><ReelsStudioPage /></ProtectedRoute>} />
      <Route path="/dashboard/audience" element={<ProtectedRoute><AudienceDNAPage /></ProtectedRoute>} />
      <Route path="/dashboard/competitors" element={<ProtectedRoute><CompetitorsPage /></ProtectedRoute>} />
      <Route path="/dashboard/copilot" element={<ProtectedRoute><CopilotPage /></ProtectedRoute>} />
      <Route path="/dashboard/media-kit" element={<ProtectedRoute><MediaKitPage /></ProtectedRoute>} />
      <Route path="/dashboard/inbox" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
      <Route path="/dashboard/stories" element={<ProtectedRoute><StoriesPage /></ProtectedRoute>} />
      <Route path="/dashboard/automation" element={<ProtectedRoute><DMAutomationPage /></ProtectedRoute>} />
      {/* legacy path from the initial release of this feature */}
      <Route path="/dashboard/funnels" element={<Navigate to="/dashboard/automation" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <PeriodComparatorProvider>
            <AppRoutes />
          </PeriodComparatorProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
