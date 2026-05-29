import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import Layout from "../components/Layout";
import MediaGrid from "../components/MediaGrid";
import ProfileCard from "../components/ProfileCard";
import StatsOverview from "../components/StatsOverview";

export default function InstaDashboardPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [media, setMedia] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const PAGE_SIZE = 12;

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const { data } = await api.get("/instagram/profile", { signal: controller.signal });
        setProfile(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err.response?.status === 404) {
          navigate("/connect");
        } else {
          setError("Failed to load profile");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [navigate]);

  useEffect(() => {
    if (!profile) return undefined;
    const controller = new AbortController();
    (async () => {
      try {
        const { data } = await api.get("/instagram/media", {
          params: { page, page_size: PAGE_SIZE },
          signal: controller.signal,
        });
        setMedia(data.items);
        setTotal(data.total);
      } catch {
        if (controller.signal.aborted) return;
        setError("Failed to load media");
      }
    })();
    return () => controller.abort();
  }, [profile, page]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data } = await api.post("/instagram/refresh");
      setProfile(data.profile);
      setPage(1);
      const mediaRes = await api.get(`/instagram/media?page=1&page_size=${PAGE_SIZE}`);
      setMedia(mediaRes.data.items);
      setTotal(mediaRes.data.total);
    } catch {
      setError("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center text-slate-500">Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {error && (
          <div className="rounded-xl px-4 py-3 text-sm bg-rose-50 border border-rose-200 text-rose-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold text-slate-900 tracking-tight">Dashboard</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="d-card flex items-center gap-2 px-4 py-2 text-sm font-medium text-violet-700 transition-opacity hover:opacity-90"
            style={{ opacity: refreshing ? 0.6 : 1 }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={refreshing ? "animate-spin" : ""}
            >
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {profile && (
          <>
            <ProfileCard profile={profile} />
            <StatsOverview profile={profile} />
          </>
        )}

        <div>
          <h2 className="text-lg font-semibold mb-4 text-slate-800">
            Posts <span className="text-sm font-normal text-slate-400">({total})</span>
          </h2>
          <MediaGrid
            items={media}
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      </div>
    </Layout>
  );
}
