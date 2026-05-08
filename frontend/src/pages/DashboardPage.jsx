import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import Layout from "../components/Layout";
import MediaGrid from "../components/MediaGrid";
import ProfileCard from "../components/ProfileCard";
import StatsOverview from "../components/StatsOverview";

export default function DashboardPage() {
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
    (async () => {
      try {
        const { data } = await api.get("/instagram/profile");
        setProfile(data);
      } catch (err) {
        if (err.response?.status === 404) {
          navigate("/connect");
        } else {
          setError("Failed to load profile");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        const { data } = await api.get(`/instagram/media?page=${page}&page_size=${PAGE_SIZE}`);
        setMedia(data.items);
        setTotal(data.total);
      } catch {
        setError("Failed to load media");
      }
    })();
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
          <div className="text-center" style={{ color: "oklch(0.65 0.02 275)" }}>Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {error && (
          <div className="rounded-xl px-4 py-3 text-sm"
            style={{ background: "oklch(0.65 0.25 25 / 0.15)", border: "1px solid oklch(0.65 0.25 25 / 0.3)", color: "oklch(0.80 0.15 25)" }}>
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.95 0.01 275)" }}>Dashboard</h1>
          <button
            onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity"
            style={{ background: "oklch(0.22 0.03 275)", color: "oklch(0.80 0.02 275)", border: "1px solid oklch(0.30 0.04 275)", opacity: refreshing ? 0.6 : 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={refreshing ? "animate-spin" : ""}>
              <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
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
          <h2 className="text-lg font-semibold mb-4" style={{ color: "oklch(0.90 0.02 275)" }}>
            Posts <span className="text-sm font-normal" style={{ color: "oklch(0.55 0.02 275)" }}>({total})</span>
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
