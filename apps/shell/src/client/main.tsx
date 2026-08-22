import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "@family-tools/ui/styles.css";
import "./app.css";

interface AppItem {
  path: string;
  name: string;
  category: string;
  blurb: string;
  icon: "fuel" | "admin" | "cookbook" | "list";
  badge?: string;
  adminOnly?: boolean;
}

interface MeResponse {
  email: string | null;
  displayName: string;
  isAdmin: boolean;
}

const APPS: AppItem[] = [
  {
    path: "/cookbook/",
    name: "Cookbook",
    category: "Kitchen",
    blurb: "Import recipes, cook from a clean view, and remember old favourites",
    icon: "cookbook",
    badge: "New",
  },
  {
    path: "/list/",
    name: "Shopping List",
    category: "Kitchen",
    blurb: "A one-handed grocery list grouped by aisle or recipe",
    icon: "list",
    badge: "New",
  },
  {
    path: "/gas/",
    name: "Fuel Prices (E10)",
    category: "Automotive",
    blurb: "Live station prices & threshold alerts near home",
    icon: "fuel",
    badge: "Live",
  },
  {
    path: "/admin/",
    name: "User Management",
    category: "System",
    blurb: "Manage display names and user permissions",
    icon: "admin",
    adminOnly: true,
  },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  if (hour >= 18 && hour < 22) return "Good evening";
  return "Good night";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [greeting, setGreeting] = useState<string>(getGreeting());
  const [today, setToday] = useState<string>(formatDate());

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json() as Promise<MeResponse>)
      .then((b) => setMe(b))
      .catch(() => setMe(null));

    const timer = setInterval(() => {
      setGreeting(getGreeting());
      setToday(formatDate());
    }, 60_000);

    return () => clearInterval(timer);
  }, []);

  const visibleApps = APPS.filter((a) => !a.adminOnly || me?.isAdmin);

  return (
    <div class="shell-container">
      <header class="head">
        <div class="head-top">
          <span class="date-badge">{today}</span>
          {me?.email && <span class="email-badge" title={me.email}>{me.email}</span>}
        </div>
        <h1 class="greeting">
          {greeting}, <span class="user-name">{me?.displayName ?? "there"}</span> 👋
        </h1>
      </header>

      <section class="apps-section">
        <div class="section-title">
          <span>Family Tools</span>
          <span class="app-count">{visibleApps.length} {visibleApps.length === 1 ? "app" : "apps"}</span>
        </div>

        <nav class="app-grid">
          {visibleApps.map((a) => (
            <a key={a.path} class="app-tile" href={a.path}>
              <div class="tile-header">
                <div class="tile-icon-wrapper">
                  {a.icon === "fuel" && (
                    <svg class="tile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17" />
                      <path d="M15 11h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1" />
                      <path d="M3 22h12" />
                      <line x1="7" y1="9" x2="11" y2="9" />
                    </svg>
                  )}
                  {a.icon === "admin" && (
                    <svg class="tile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  )}
                  {a.icon === "cookbook" && (
                    <svg class="tile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /><path d="M8 7h8M8 11h8" />
                    </svg>
                  )}
                  {a.icon === "list" && (
                    <svg class="tile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="m3 7 2 2 4-4M3 17l2 2 4-4M13 6h8M13 12h8M13 18h8" />
                    </svg>
                  )}
                </div>
                <div class="tile-meta">
                  <span class="tile-category">{a.category}</span>
                  {a.badge && <span class="tile-badge">{a.badge}</span>}
                </div>
              </div>

              <div class="tile-body">
                <h2 class="tile-name">{a.name}</h2>
                <p class="tile-blurb">{a.blurb}</p>
              </div>

              <div class="tile-footer">
                <span class="tile-action">Open application</span>
                <svg class="tile-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </div>
            </a>
          ))}
        </nav>
      </section>
    </div>
  );
}

render(<App />, document.getElementById("app")!);
