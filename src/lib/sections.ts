// The console's menu: a few groups, and sections that hold several pages as tabs, so the sidebar
// stays short while every page keeps its own address. Pure; ConsoleShell draws the menu and, on
// any page that belongs to a section, the section's tabs above it.

export type Tab = { to: string; label: string };
export type MenuItem = {
  label: string;
  /** Where the item opens: its first tab, for a section. */
  to: string;
  faint?: string;
  /** The pages it holds, shown as tabs; absent for a single page. */
  tabs?: Tab[];
  principalOnly?: boolean;
  adminOnly?: boolean;
  superOnly?: boolean;
};
export type MenuGroup = { title: string; items: MenuItem[] };

export const MENU: MenuGroup[] = [
  {
    title: "Operate",
    items: [
      { to: "/home", label: "Home" },
      { to: "/diary", label: "Diary & news" },
      {
        to: "/plan",
        label: "Strategy",
        faint: "PLAN",
        tabs: [
          { to: "/plan", label: "Next two weeks" },
          { to: "/roadmap", label: "Road to election day" },
          { to: "/strategy", label: "What the numbers say" },
          { to: "/elections", label: "Elections atlas" },
        ],
      },
      {
        to: "/voters",
        label: "Field",
        faint: "DOORS",
        tabs: [
          { to: "/voters", label: "Voters map" },
          { to: "/field-plan", label: "Field plan" },
          { to: "/agents", label: "Agents & stipends" },
        ],
      },
    ],
  },
  {
    title: "Comms",
    items: [
      { to: "/inbox", label: "Inbox" },
      { to: "/broadcast", label: "Broadcast & ads" },
      {
        to: "/listening",
        label: "Listening & polls",
        faint: "LIVE",
        tabs: [
          { to: "/listening", label: "Listening" },
          { to: "/polling", label: "Polls" },
        ],
      },
      { to: "/website", label: "Website", faint: "PUBLIC" },
    ],
  },
  {
    title: "Money",
    items: [{ to: "/finance", label: "Finance", principalOnly: true }],
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
      { to: "/campaigns", label: "Campaigns", faint: "ALL", superOnly: true },
    ],
  },
];

const page = (path: string) => "/" + (path.split("/")[1] ?? "");

/** Whether the menu item is the one the page at `path` belongs to. */
export const isCurrent = (item: MenuItem, path: string) =>
  (item.tabs?.map((t) => t.to) ?? [item.to]).includes(page(path));

/** The section the page at `path` belongs to, when it is one with tabs. */
export function sectionOf(path: string, menu: MenuGroup[] = MENU): MenuItem | null {
  for (const g of menu) for (const i of g.items) if (i.tabs && isCurrent(i, path)) return i;
  return null;
}

/** Every page the menu opens, each once. */
export const menuPages = (menu: MenuGroup[] = MENU) => [
  ...new Set(menu.flatMap((g) => g.items.flatMap((i) => i.tabs?.map((t) => t.to) ?? [i.to]))),
];
