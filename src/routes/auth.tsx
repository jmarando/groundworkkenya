import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { GwMark } from "@/components/gw/GwMark";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in · Groundwork" },
      { name: "description", content: "Sign in to the Groundwork campaign console." },
      { property: "og:title", content: "Sign in · Groundwork" },
      { property: "og:description", content: "Sign in to the Groundwork campaign console." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/overview", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // Back to /auth, not the marketing page: /auth is where the
            // session carried in the confirmation link gets read.
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setMsg("Check your email to confirm the account, then sign in.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/overview", replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setErr(null);
    // On the published site this is a full-page redirect, and the browser comes
    // back to redirect_uri carrying the session. It has to be /auth: the home
    // page never reads it, so returning there left people signed out on the
    // marketing page.
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
    });
    if (result.error) {
      setErr("Google sign-in failed. Try again.");
      return;
    }
    if (result.redirected) return;
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
          {mode === "in" ? "Welcome " : "Join the "}
          <span className="serif">{mode === "in" ? "back." : "workspace."}</span>
        </h1>
        <p className="meta">2027 cycle</p>

        <form onSubmit={submit} className="auth-form">
          {mode === "up" ? (
            <label className="auth-field">
              <span className="eyebrow">Full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          ) : null}
          <label className="auth-field">
            <span className="eyebrow">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="auth-field">
            <span className="eyebrow">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
            />
          </label>
          {err ? <p className="auth-err">{err}</p> : null}
          {msg ? <p className="auth-msg">{msg}</p> : null}
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? "Working…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button className="btn btn--ghost" type="button" onClick={google}>
          Continue with Google
        </button>

        <button
          className="auth-switch"
          type="button"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "No account yet? Create one" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
