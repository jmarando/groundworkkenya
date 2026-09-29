import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { currentCampaignSlug } from "@/lib/access";
import { getPublicCampaign } from "@/lib/campaign-public.functions";

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
  // Each campaign signs in on its own address (sakaja.groundwork.ke), or with
  // ?campaign=sakaja while the addresses are being set up.
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => setSlug(currentCampaignSlug()), []);
  const fetchCampaign = useServerFn(getPublicCampaign);
  const { data: campaign } = useQuery({
    queryKey: ["public-campaign", slug],
    queryFn: () => {
      if (!slug) return null;
      return fetchCampaign({ data: { slug } });
    },
    enabled: !!slug,
  });

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
        // "up" is the forgot-password mode: accounts are created by invite only.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/set-password`,
        });
        if (error) throw error;
        setMsg("If that email is on a team, a link to set a new password is on its way.");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
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
        {campaign ? (
          <div className="auth-campaign">
            <span className="eyebrow">Official campaign workspace · 2027</span>
            <h1>{campaign.candidate || campaign.name}</h1>
            <span className="auth-campaign-seat">{campaign.seat}</span>
          </div>
        ) : (
          <h1 className="auth-title">
            {mode === "in" ? "Welcome " : "Join the "}
            <span className="serif">{mode === "in" ? "back." : "workspace."}</span>
          </h1>
        )}
        {campaign ? (
          <h2 className="auth-action-title">{mode === "in" ? "Team sign in" : "Request access"}</h2>
        ) : null}
        <p className="meta">
          {campaign
            ? `Only ${campaign.name}'s team can get in. New accounts wait for the candidate or campaign manager to let them in.`
            : "2027 cycle"}
        </p>

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
