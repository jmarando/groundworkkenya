import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { GwMark } from "./GwMark";
import { supabase } from "@/integrations/supabase/client";

type NavItem = { to: string; label: string; faint?: string };

const GROUPS: { title: string; items: NavItem[]; inert?: NavItem[] }[] = [
  {
    title: "Operate",
    items: [
      { to: "/overview", label: "Overview" },
      { to: "/people", label: "People", faint: "CRM" },
      { to: "/voters", label: "Know your voters", faint: "MAP" },
      { to: "/polling", label: "Polling", faint: "LIVE" },
    ],
    inert: [
      { to: "#", label: "Canvassing", faint: "§3.3" },
      { to: "#", label: "Agents & stipends", faint: "§3.4" },
    ],
  },
  {
    title: "Comms",
    items: [
      { to: "/inbox", label: "Inbox" },
      { to: "/broadcast", label: "Broadcast & ads" },
      { to: "/listening", label: "Listening", faint: "LIVE DATA" },
    ],
  },
  {
    title: "Money",
    items: [{ to: "/finance", label: "Finance" }],
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
    items: [{ to: "/foundations", label: "Brand & design" }],
  },
];

const TOPBAR: NavItem[] = GROUPS.flatMap((g) => g.items);

export function ConsoleShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
          <div className="sb-tenant-name">Campaign 2027</div>
          <div className="sb-tenant-sub">Governor · 2027 cycle</div>
        </div>

        <nav aria-label="Product">
          {GROUPS.map((group) => (
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
        <div className="topbar">
          <GwMark />
          <span className="sb-brand-name">groundwork</span>
          <nav className="topbar-nav" aria-label="Views">
            {TOPBAR.map((item) => (
              <Link key={item.to} to={item.to} activeProps={{ "aria-current": "page" }}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="wrap">{children}</div>
      </div>
    </div>
  );
}
