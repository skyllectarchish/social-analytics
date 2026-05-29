import Navbar from "./Navbar";
import DashboardSidebar from "./DashboardSidebar";
import { PeriodComparatorProvider } from "../context/PeriodComparatorContext";

export default function DashboardLayout({ children }) {
  return (
    <div className="dashboard-root">
      <div className="dashboard-aurora" aria-hidden="true" />
      <Navbar />
      <PeriodComparatorProvider>
        <div className="flex items-start">
          <DashboardSidebar />
          <main className="dashboard-content flex-1 min-w-0 px-4 sm:px-6 py-3">
            {children}
          </main>
        </div>
      </PeriodComparatorProvider>
    </div>
  );
}
