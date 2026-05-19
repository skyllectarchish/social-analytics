import Navbar from "./Navbar";
import DashboardSidebar from "./DashboardSidebar";
import { PeriodComparatorProvider } from "../context/PeriodComparatorContext";

export default function DashboardLayout({ children }) {
  return (
    <div className="dashboard-root">
      <div className="dashboard-aurora" aria-hidden="true" />
      <Navbar />
      <PeriodComparatorProvider>
        <div className="dashboard-content flex max-w-[1440px] mx-auto">
          <DashboardSidebar />
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </PeriodComparatorProvider>
    </div>
  );
}
