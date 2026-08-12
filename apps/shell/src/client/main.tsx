import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "@family-tools/ui/styles.css";
import "./app.css";

interface AppItem {
  path: string;
  name: string;
  category: string;
  blurb: string;
  icon: "fuel";
  badge?: string;
}

const APPS: AppItem[] = [
  {
    path: "/gas/",
    name: "Fuel Prices (E10)",
    category: "Automotive",
    blurb: "Live station prices & threshold alerts near home",
    icon: "fuel",
    badge: "Live",
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

function getUserDisplayName(email: string | null): string {
  if (!email) return "there";
  const user = email.split("@")[0];
  if (!user) return "there";
  const firstPart = user.split(".")[0] ?? user;
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}

function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<string>(getGreeting());
  const [today, setToday] = useState<string>(formatDate());

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json() as Promise<{ email: string }>)
      .then((b) => setEmail(b.email))
      .catch(() => setEmail(null));

    const timer = setInterval(() => {
      setGreeting(getGreeting());
      setToday(formatDate());
    }, 60_000);

    return () => clearInterval(timer);
  }, []);

  const displayName = getUserDisplayName(email);

  return (
    <div class="shell-container">
      <header class="head">
        <div class="head-top">
          <span class="date-badge">{today}</span>
          {email && <span class="email-badge" title={email}>{email}</span>}
        </div>
        <h1 class="greeting">
          {greeting}, <span class="user-name">{displayName}</span> 👋
        </h1>
      </header>

      <section class="apps-section">
        <div class="section-title">
          <span>Family Tools</span>
          <span class="app-count">{APPS.length} {APPS.length === 1 ? "app" : "apps"}</span>
        </div>

        <nav class="app-grid">
          {APPS.map((a) => (
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
