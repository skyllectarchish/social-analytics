import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import api, { errorMessage } from "../api/client";
import type { YoutubeCallbackResponse } from "../api/youtubeTypes";

type Status = "working" | "ok" | "error";

export default function YoutubeCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState("Finishing the YouTube connection…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = params.get("code");
    const state = params.get("state") || sessionStorage.getItem("yt_oauth_state") || "";
    const oauthError = params.get("error_description") || params.get("error");

    if (oauthError) { setStatus("error"); setMessage(oauthError); return; }
    if (!code) { setStatus("error"); setMessage("Missing authorization code from Google."); return; }

    api
      .get<YoutubeCallbackResponse>("/youtube/callback", { params: { code, state } })
      .then(() => {
        sessionStorage.removeItem("yt_oauth_state");
        setStatus("ok");
        setMessage("Channel connected! Taking you to your dashboard…");
        setTimeout(() => navigate("/youtube", { replace: true }), 900);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(errorMessage(err, "Could not complete the YouTube connection"));
      });
  }, [params, navigate]);

  return (
    <div className="aurora-scene grain relative grid min-h-dvh place-items-center px-4">
      <div className="card-hairline w-full max-w-sm p-8 text-center">
        {status === "working" && <Loader2 className="mx-auto h-10 w-10 animate-spin text-violet-deep" />}
        {status === "ok" && <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />}
        {status === "error" && <XCircle className="mx-auto h-10 w-10 text-red-500" />}
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          {status === "ok" ? "All set" : status === "error" ? "Connection failed" : "Connecting…"}
        </h1>
        <p className="mt-2 text-sm text-foreground/65">{message}</p>
        {status === "error" && (
          <Link to="/youtube/connect" className="btn-glow mt-6 inline-flex">Try again</Link>
        )}
      </div>
    </div>
  );
}
