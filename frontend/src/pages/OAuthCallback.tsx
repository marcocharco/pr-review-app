import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { exchangeCodeForToken } from "../utils/githubOAuth";

type Status = "pending" | "success" | "error";

export default function OAuthCallback() {
  const [status, setStatus] = useState<Status>("pending");
  const [message, setMessage] = useState(
    "Exchanging code for an access token…",
  );
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const stateParam = params.get("state");
      const error = params.get("error");
      const errorDescription = params.get("error_description");

      if (error) {
        setStatus("error");
        setMessage(errorDescription || error);
        return;
      }

      if (!code) {
        setStatus("error");
        setMessage("Missing ?code in the callback URL.");
        return;
      }

      try {
        // If token already exists (e.g., first effect run in StrictMode), skip a second exchange.
        const existing = localStorage.getItem("github_access_token");
        if (existing) {
          setStatus("success");
          setMessage("Already signed in. Redirecting…");
          setTimeout(() => window.location.replace("/"), 400);
          return;
        }

        const token = await exchangeCodeForToken(code, stateParam);
        localStorage.setItem("github_access_token", token);
        setStatus("success");
        setMessage("Signed in with GitHub. Redirecting back to the app…");
        setTimeout(() => {
          window.location.replace("/");
        }, 600);
      } catch (err) {
        console.error(err);
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "OAuth failed.");
      }
    };

    run();
  }, []);

  const isWorking = status === "pending";
  const isSuccess = status === "success";

  return (
    <div className="w-screen h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center">
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl px-8 py-6 w-[420px] shadow-2xl shadow-black/50 space-y-4">
        <div className="flex items-center gap-3">
          {isWorking && (
            <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
              <Loader2 className="animate-spin text-blue-400" size={20} />
            </div>
          )}
          {isSuccess && (
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck className="text-emerald-400" size={20} />
            </div>
          )}
          {status === "error" && (
            <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
              <AlertTriangle className="text-rose-400" size={20} />
            </div>
          )}
          <div>
            <p className="text-sm text-zinc-400">GitHub OAuth</p>
            <p className="font-semibold">
              {isWorking && "Finishing sign-in…"}
              {isSuccess && "You are signed in!"}
              {status === "error" && "Sign-in failed"}
            </p>
          </div>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">{message}</p>
        {status === "error" && (
          <button
            className="w-full bg-[#27272a] hover:bg-[#323236] text-zinc-100 px-4 py-2 rounded-md border border-[#3a3a3d] transition-colors text-sm"
            onClick={() => window.location.replace("/")}
          >
            Return to app
          </button>
        )}
      </div>
    </div>
  );
}
