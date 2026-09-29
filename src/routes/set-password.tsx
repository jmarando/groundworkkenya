import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { GwMark } from "@/components/gw/GwMark";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/set-password")({
  ssr: false,
  component: SetPassword,
  head: () => ({
    meta: [
      { title: "Set your password · Groundwork" },
      { name: "description", content: "Choose a password for your Groundwork campaign account." },
      { property: "og:title", content: "Set your password · Groundwork" },
      { property: "og:description", content: "Choose a password for your Groundwork campaign account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function SetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The link in the invite or reset email carries a session; wait for it.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const t = setTimeout(() => setReady((r) => r ?? false), 4000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setErr("The two passwords don't match.");
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setErr(error.message);
    navigate({ to: "/overview", replace: true });
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <GwMark />
          <div>
            <div className="sb-brand-name">groundwork</div>
            <div className="sb-brand-sub">the campaign OS</div>
          </div>
        </div>
        <h1 className="auth-title">
          Set your <span className="serif">password.</span>
        </h1>
        {ready === false ? (
          <>
            <p className="meta">
              This link has expired or was already used. Ask your campaign to resend the invite,
              or use "Forgot password?" on the sign-in page.
            </p>
            <a className="btn btn--primary" href="/auth">
              Go to sign in
            </a>
          </>
        ) : (
          <>
            <p className="meta">You'll use this with your email to sign in from now on.</p>
            <form onSubmit={submit} className="auth-form">
              <label className="auth-field">
                <span className="eyebrow">New password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              <label className="auth-field">
                <span className="eyebrow">Type it again</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              {err ? <p className="auth-err">{err}</p> : null}
              <button className="btn btn--primary" type="submit" disabled={busy || !ready}>
                {!ready ? "Checking your link…" : busy ? "Saving…" : "Save and continue"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
