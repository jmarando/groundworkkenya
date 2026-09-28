import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

import { GwMark } from "./GwMark";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import { CampaignSwitcher } from "./CampaignSwitcher";

type NavItem = {
  to: string;
  label: string;
  faint?: string;
  principalOnly?: boolean;
  adminOnly?: boolean;
  superOnly?: boolean;
};

const GROUPS: { title: string; items: NavItem[]; inert?: NavItem[] }[] = [
  {
    title: "Operate",
    items: [
      { to: "/overview", label: "Overview" },
      { to: "/briefing", label: "Briefing", faint: "INSIGHT" },
      { to: "/people", label: "People", faint: "CRM" },
      { to: "/voters", label: "Know your voters", faint: "MAP" },
      { to: "/polling", label: "Polling", faint: "LIVE" },
      { to: "/canvassing", label: "Canvassing", faint: "§3.3" },
      { to: "/agents", label: "Agents & stipends", faint: "§3.4" },
    ],
  },
  {
    title: "Comms",
    items: [
      { to: "/inbox", label: "Inbox" },
      { to: "/broadcast", label: "Broadcast & ads" },
      { to: "/social", label: "Social & sentiment", faint: "AI" },
      { to: "/listening", label: "Listening", faint: "LIVE DATA" },
    ],
  },
  {
    title: "Money",
    items: [{ to: "/finance", label: "Finance", principalOnly: true }],
    inert: [{ to: "#", label: "Disclosure", faint: "§9.4" }],
  },
  {
    title: "Election day",
    items: [
      { to: "/warroom", label: "War room" },
      { to: "/field", label: "Field app" },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/team", label: "Team", faint: "ACCESS", adminOnly: true },
      { to: "/campaigns", label: "Campaigns", faint: "SUPER", superOnly: true },
      { to: "/foundations", label: "Brand & design" },
    ],
  },
];

export function ConsoleShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const { isPrincipal, isAdmin, isSuper, campaign } = useAccess();
  const visible = (items: NavItem[]) =>
    items.filter(
      (i) =>
        (!i.principalOnly || isPrincipal) && (!i.adminOnly || isAdmin) && (!i.superOnly || isSuper),
    );
  const groups = GROUPS.map((g) => ({ ...g, items: visible(g.items) })).filter(
    (g) => g.items.length > 0 || (g.inert?.length ?? 0) > 0,
  );
  const queryClient = useQueryClient();

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="app">
      <aside className="sb">
        <div className="sb-brand">
          <GwMark />
          <div>
            <div className="sb-brand-name">groundwork</div>
            <div className="sb-brand-sub">the campaign OS</div>
          </div>
        </div>
        <div className="sb-tenant">
          <div className="sb-tenant-name">{campaign?.name ?? "No campaign open"}</div>
          <div className="sb-tenant-sub">{campaign ? `${campaign.seat} · 2027 cycle` : "—"}</div>
          {isSuper ? <CampaignSwitcher current={campaign?.id ?? null} /> : null}
        </div>

        <nav aria-label="Product">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="sb-group">
                <span className="eyebrow">{group.title}</span>
              </div>
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="sb-item"
                  activeProps={{ "aria-current": "page" }}
                >
                  {item.label}
                  {item.faint ? (
                    <>
                      {" "}
                      <span className="faint">{item.faint}</span>
                    </>
                  ) : null}
                </Link>
              ))}
              {group.inert?.map((item) => (
                <button key={item.label} className="sb-item" data-inert type="button">
                  {item.label} <span className="faint">{item.faint}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          <span className="sb-tag">
            <span className="dot-live" aria-hidden="true" /> Workspace · live
          </span>
          <div className="sb-foot-line">
            <button className="sb-signout" type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-brand">
            <GwMark />
            <span className="sb-brand-name">groundwork</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="topbar-toggle"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            <span>Menu</span>
          </Button>
        </header>
        {menuOpen && (
          <div className="mobile-menu-layer" id="mobile-menu">
            <Button
              type="button"
              variant="ghost"
              className="mobile-menu-backdrop"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
            <nav className="mobile-menu-panel" aria-label="Product menu">
              <div className="mobile-menu-group">
                <div className="mobile-menu-heading">{campaign?.name ?? "No campaign open"}</div>
                {isSuper ? <CampaignSwitcher current={campaign?.id ?? null} /> : null}
              </div>
              {groups.map((group) => (
                <div className="mobile-menu-group" key={group.title}>
                  <div className="mobile-menu-heading">{group.title}</div>
                  {group.items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="mobile-menu-item"
                      activeProps={{ "aria-current": "page" }}
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>{item.label}</span>
                      {item.faint && <span className="mobile-menu-faint">{item.faint}</span>}
                    </Link>
                  ))}
                </div>
              ))}
              <div className="mobile-menu-footer">
                <Button type="button" variant="ghost" className="mobile-menu-signout" onClick={signOut}>
                  Sign out
                </Button>
              </div>
            </nav>
          </div>
        )}
        <div className="wrap">{children}</div>
      </div>
    </div>
  );
}
