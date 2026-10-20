import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

import { GwMark } from "./GwMark";
import { InstallApp } from "./offline/InstallApp";
import { OfflineBar } from "./offline/OfflineBar";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/hooks/useAccess";
import { useSignOut } from "@/hooks/useSignOut";
import { CampaignSwitcher } from "./CampaignSwitcher";
import { canOpen } from "@/lib/access";
import { isCurrent, MENU, sectionOf, type MenuItem } from "@/lib/sections";

export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const { isPrincipal, isAdmin, isSuper, campaign, access } = useAccess();
  const role = access?.role ?? null;
  /** A section shows the tabs its reader may open, and opens on the first of them. */
  const allowed = (i: MenuItem): MenuItem | null => {
    if ((i.principalOnly && !isPrincipal) || (i.adminOnly && !isAdmin) || (i.superOnly && !isSuper))
      return null;
    if (!i.tabs) return canOpen(role, i.to) ? i : null;
    const tabs = i.tabs.filter((t) => canOpen(role, t.to));
    return tabs.length ? { ...i, to: tabs[0]!.to, tabs } : null;
  };
  const groups = MENU.map((g) => ({
    ...g,
    items: g.items.flatMap((i) => allowed(i) ?? []),
  })).filter((g) => g.items.length > 0);
  const section = sectionOf(pathname, groups);
  const signOut = useSignOut();

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

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
                  key={item.label}
                  to={item.to}
                  className="sb-item"
                  aria-current={isCurrent(item, pathname) ? "page" : undefined}
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
          <div className="sb-foot-line">
            <InstallApp className="sb-signout" />
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
                      key={item.label}
                      to={item.to}
                      className="mobile-menu-item"
                      aria-current={isCurrent(item, pathname) ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>{item.label}</span>
                      {item.faint && <span className="mobile-menu-faint">{item.faint}</span>}
                    </Link>
                  ))}
                </div>
              ))}
              <div className="mobile-menu-footer">
                <Button
                  type="button"
                  variant="ghost"
                  className="mobile-menu-signout"
                  onClick={signOut}
                >
                  Sign out
                </Button>
                <InstallApp className="mobile-menu-install" />
              </div>
            </nav>
          </div>
        )}
        <div className="wrap">
          <OfflineBar />
          {section?.tabs && section.tabs.length > 1 && (
            <nav className="sec-tabs" aria-label={section.label}>
              <span className="eyebrow sec-tabs-name">{section.label}</span>
              {section.tabs.map((t) => (
                <Link
                  key={t.to}
                  to={t.to}
                  className="sec-tab"
                  aria-current={isCurrent({ ...t }, pathname) ? "page" : undefined}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
