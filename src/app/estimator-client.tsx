"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import type { EstimateResponse, EstimatedTeam, SubscriptionCategory, SubscriptionGender } from "@/lib/types";

export type DesignVersion = "v1" | "v2" | "v3" | "v4" | "v5";

type ApiError = { error: string; code: string };
type Mode = "estimate" | "subscribe";
type TabId = "automatic" | "waitlist" | "all" | "unresolved";
type SubscriptionStatus = { kind: "success" | "error"; message: string } | null;
type IconName =
  | "arrow-left"
  | "bell"
  | "check"
  | "chevron-right"
  | "external"
  | "mail"
  | "search"
  | "spark"
  | "trophy"
  | "users";

const CATEGORY_OPTIONS = ["Premium", "A+", "A", "B", "C"] as const satisfies readonly SubscriptionCategory[];
const GENDER_OPTIONS = [
  { value: "male", label: "Men" },
  { value: "female", label: "Women" },
  { value: "mixed", label: "Mixed" },
] as const satisfies readonly { value: SubscriptionGender; label: string }[];
const TAB_ORDER: TabId[] = ["automatic", "waitlist", "all", "unresolved"];

const DESIGN_COPY: Record<
  DesignVersion,
  { label: string; eyebrow: string; title: string; description: string }
> = {
  v1: {
    label: "Court Plan",
    eyebrow: "Berlin-Brandenburg Beach Tour",
    title: "Know Your Place On The Draw.",
    description: "Turn a public tournament list into a clear estimate of direct entries and waitlist positions.",
  },
  v2: {
    label: "Sunset Ticket",
    eyebrow: "Your Next Tournament Starts Here",
    title: "Will You Make The Cut?",
    description: "Paste the tournament link. We’ll sort the registrations and show where your team is likely to land.",
  },
  v3: {
    label: "Live Board",
    eyebrow: "BB Tour / Admission Console",
    title: "ENTRY STATUS",
    description: "Live estimation from public registration and ranking data. No account required.",
  },
  v4: {
    label: "Coastal Calm",
    eyebrow: "A Simpler Way Into The Sand",
    title: "Plan The Tournament, Not The Guesswork.",
    description: "A calm, guided estimate for teams watching the Berlin-Brandenburg entry list.",
  },
  v5: {
    label: "Federation Desk",
    eyebrow: "Tournament Admission Service",
    title: "Entry Estimate & Tournament Alerts",
    description: "Review predicted admission status using current public registrations and applicable ranking rules.",
  },
};

export function EstimatorClient({ version }: { version: DesignVersion }) {
  const [mode, setMode] = useState<Mode>("estimate");
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<EstimateResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("automatic");
  const [email, setEmail] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<SubscriptionCategory[]>([...CATEGORY_OPTIONS]);
  const [selectedGender, setSelectedGender] = useState<SubscriptionGender>("male");
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>(null);
  const copy = DESIGN_COPY[version];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tournamentUrl: url }),
      });
      const payload = (await response.json()) as EstimateResponse | ApiError;

      if (!response.ok) {
        setError(payload as ApiError);
        return;
      }

      setResult(payload as EstimateResponse);
      setActiveTab("automatic");
    } catch {
      setError({ error: "Could not reach the estimator. Check your connection and try again.", code: "NETWORK_ERROR" });
    } finally {
      setLoading(false);
    }
  }

  async function submitSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubscriptionStatus(null);

    if (selectedCategories.length === 0) {
      setSubscriptionStatus({ kind: "error", message: "Select at least 1 category to create an alert." });
      return;
    }

    setSubscriptionLoading(true);
    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, categories: selectedCategories, gender: selectedGender }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok) {
        setSubscriptionStatus({ kind: "error", message: payload.error || "Could not save the alert. Try again." });
        return;
      }

      setSubscriptionStatus({ kind: "success", message: "Tournament alert created." });
    } catch {
      setSubscriptionStatus({ kind: "error", message: "Could not reach the alert service. Check your connection." });
    } finally {
      setSubscriptionLoading(false);
    }
  }

  function toggleCategory(category: SubscriptionCategory) {
    setSelectedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, id: TabId) {
    if (!(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const currentIndex = TAB_ORDER.indexOf(id);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? TAB_ORDER.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + TAB_ORDER.length) % TAB_ORDER.length;
    const nextTab = TAB_ORDER[nextIndex];
    setActiveTab(nextTab);
    document.getElementById(`tab-${nextTab}`)?.focus();
  }

  const visibleTeams = useMemo(() => {
    if (!result) return [];
    if (activeTab === "automatic") return result.automatic;
    if (activeTab === "waitlist") return result.waitlist;
    if (activeTab === "unresolved") return result.unresolved;
    return result.allTeams;
  }, [activeTab, result]);

  return (
    <div className="design-page" data-design={version}>
      <a className="skip-link" href="#main-content">Skip To Main Content</a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Back to all design concepts">
          <BrandMark />
          <span>Beach Entry</span>
        </Link>
        <nav className="version-nav" aria-label="Design versions">
          {(["v1", "v2", "v3", "v4", "v5"] as DesignVersion[]).map((item) => (
            <Link href={`/${item}`} key={item} aria-current={item === version ? "page" : undefined}>
              {item.toUpperCase()}
            </Link>
          ))}
        </nav>
        <Link className="all-concepts" href="/">
          <Icon name="arrow-left" />
          All Concepts
        </Link>
      </header>

      <main className="app-shell" id="main-content">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 id="page-title">{copy.title}</h1>
            <p className="hero-description">{copy.description}</p>
          </div>
          <HeroVisual version={version} />
          <p className="concept-label"><span>{version.toUpperCase()}</span>{copy.label}</p>
        </section>

        <section className="workspace" aria-label="Tournament tools">
          <div className="mode-switcher" role="group" aria-label="Choose a tool">
            <button
              className={mode === "estimate" ? "active" : ""}
              type="button"
              aria-pressed={mode === "estimate"}
              onClick={() => setMode("estimate")}
            >
              <Icon name="search" />
              Estimate Entry
            </button>
            <button
              className={mode === "subscribe" ? "active" : ""}
              type="button"
              aria-pressed={mode === "subscribe"}
              onClick={() => setMode("subscribe")}
            >
              <Icon name="bell" />
              Tournament Alerts
            </button>
          </div>

          {mode === "estimate" ? (
            <div className="tool-content">
              <form className="url-form" onSubmit={submit}>
                <div className="form-heading">
                  <span className="step-mark" aria-hidden="true">01</span>
                  <div>
                    <h2>Check A Tournament</h2>
                    <p>Use the public tournament page from beachvolleybb.de.</p>
                  </div>
                </div>
                <label className="input-label" htmlFor={`tournament-url-${version}`}>Tournament URL</label>
                <div className="input-action-row">
                  <span className="input-icon" aria-hidden="true"><Icon name="external" /></span>
                  <input
                    id={`tournament-url-${version}`}
                    name="tournamentUrl"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://www.beachvolleybb.de/…"
                    aria-describedby={`url-help-${version}`}
                  />
                  <button className="primary-action" type="submit" disabled={loading}>
                    {loading ? <><span className="spinner" aria-hidden="true" />Estimating…</> : <>Estimate Entry<Icon name="chevron-right" /></>}
                  </button>
                </div>
                <p className="field-help" id={`url-help-${version}`}>Public adult tournaments only. Your link is not stored.</p>
              </form>

              <div className="result-region" aria-live="polite" aria-busy={loading}>
                {error ? (
                  <section className="notice error" role="alert">
                    <span className="notice-icon" aria-hidden="true">!</span>
                    <div><strong>Couldn’t Estimate This Tournament</strong><p>{error.error}</p></div>
                    <code>{error.code}</code>
                  </section>
                ) : null}

                {result ? (
                  <EstimateResults
                    result={result}
                    activeTab={activeTab}
                    visibleTeams={visibleTeams}
                    onTabClick={setActiveTab}
                    onTabKey={handleTabKey}
                  />
                ) : !loading && !error ? <EmptyEstimate /> : null}
              </div>
            </div>
          ) : (
            <section className="subscribe-panel" aria-labelledby="alert-title">
              <div className="form-heading">
                <span className="step-mark" aria-hidden="true">02</span>
                <div>
                  <h2 id="alert-title">Create A Tournament Alert</h2>
                  <p>Get one email when a matching tournament is published.</p>
                </div>
              </div>
              <form className="subscribe-form" onSubmit={submitSubscription}>
                <fieldset className="field-group">
                  <legend>Competition</legend>
                  <div className="choice-list">
                    {GENDER_OPTIONS.map((gender) => (
                      <label className="choice-card" key={gender.value}>
                        <input
                          type="radio"
                          name="gender"
                          value={gender.value}
                          checked={selectedGender === gender.value}
                          onChange={() => setSelectedGender(gender.value)}
                        />
                        <span className="radio-mark" aria-hidden="true" />
                        <span>{gender.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="field-group">
                  <legend>Categories</legend>
                  <div className="category-list">
                    {CATEGORY_OPTIONS.map((category) => (
                      <label className="category-card" key={category}>
                        <input
                          type="checkbox"
                          name="categories"
                          value={category}
                          checked={selectedCategories.includes(category)}
                          onChange={() => toggleCategory(category)}
                        />
                        <span className="check-mark" aria-hidden="true"><Icon name="check" /></span>
                        <span>{category}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="email-field">
                  <label className="input-label" htmlFor={`email-${version}`}>Email Address</label>
                  <div className="input-action-row">
                    <span className="input-icon" aria-hidden="true"><Icon name="mail" /></span>
                    <input
                      id={`email-${version}`}
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      spellCheck={false}
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    placeholder="team@example.com…"
                    />
                    <button className="primary-action" type="submit" disabled={subscriptionLoading}>
                      {subscriptionLoading ? <><span className="spinner" aria-hidden="true" />Saving…</> : <>Create Alert<Icon name="chevron-right" /></>}
                    </button>
                  </div>
                </div>
              </form>
              {subscriptionStatus ? (
                <div className={`notice ${subscriptionStatus.kind}`} role="status" aria-live="polite">
                  <span className="notice-icon" aria-hidden="true">{subscriptionStatus.kind === "success" ? <Icon name="check" /> : "!"}</span>
                  <strong>{subscriptionStatus.message}</strong>
                </div>
              ) : null}
            </section>
          )}
        </section>
      </main>

      <footer className="site-footer">
        <span>Independent tool for public BeachvolleyBB data.</span>
        <a href="mailto:main@mauricekuehl.com">Contact</a>
      </footer>
    </div>
  );
}

function EstimateResults({
  result,
  activeTab,
  visibleTeams,
  onTabClick,
  onTabKey,
}: {
  result: EstimateResponse;
  activeTab: TabId;
  visibleTeams: EstimatedTeam[];
  onTabClick: (id: TabId) => void;
  onTabKey: (event: KeyboardEvent<HTMLButtonElement>, id: TabId) => void;
}) {
  const fetchedAt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(result.dataSources.fetchedAt),
  );

  return (
    <div className="results">
      <div className="results-heading">
        <div>
          <p className="eyebrow">Estimate Ready</p>
          <h2>{result.tournament.name}</h2>
        </div>
        <span className="result-confidence"><Icon name="spark" />Live Public Data</span>
      </div>
      <section className="summary-grid" aria-label="Tournament summary">
        <Metric label="Category" value={result.tournament.categoryLabel || result.tournament.category} />
        <Metric label="Date" value={result.tournament.date || "Not Published"} />
        <Metric label="Direct Spots" value={String(result.tournament.automaticCapacity)} featured />
        <Metric label="Wildcards" value={String(result.tournament.wildcardMainDraw)} />
        <Metric label="Teams" value={String(result.allTeams.length)} />
      </section>
      <section className="rule-panel">
        <span className="rule-icon" aria-hidden="true"><Icon name="trophy" /></span>
        <div><strong>How This Draw Is Sorted</strong><p>{result.ruleSummary}</p></div>
        <time dateTime={result.dataSources.fetchedAt}>Updated {fetchedAt}</time>
      </section>
      <section className="table-section" aria-labelledby="team-list-title">
        <div className="table-toolbar">
          <div><p className="eyebrow">Predicted Draw</p><h3 id="team-list-title">Team List</h3></div>
          <div className="tabs" role="tablist" aria-label="Estimate views">
            <TabButton id="automatic" active={activeTab} count={result.automatic.length} onClick={onTabClick} onKeyDown={onTabKey}>Direct</TabButton>
            <TabButton id="waitlist" active={activeTab} count={result.waitlist.length} onClick={onTabClick} onKeyDown={onTabKey}>Waitlist</TabButton>
            <TabButton id="all" active={activeTab} count={result.allTeams.length} onClick={onTabClick} onKeyDown={onTabKey}>All</TabButton>
            <TabButton id="unresolved" active={activeTab} count={result.unresolved.length} onClick={onTabClick} onKeyDown={onTabKey}>Review</TabButton>
          </div>
        </div>
        <div id="team-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} tabIndex={0}>
          <TeamTable teams={visibleTeams} />
        </div>
      </section>
    </div>
  );
}

function EmptyEstimate() {
  return (
    <section className="empty-state">
      <div className="empty-visual" aria-hidden="true"><span /><Icon name="users" /><span /></div>
      <div><h2>Your Estimate Will Appear Here</h2><p>Paste a public adult tournament link above to see predicted direct entries, waitlist positions, and the ranking rule used.</p></div>
      <ol aria-label="How it works"><li><span>1</span>Paste Link</li><li><span>2</span>Read Rankings</li><li><span>3</span>See The Draw</li></ol>
    </section>
  );
}

function Metric({ label, value, featured = false }: { label: string; value: string; featured?: boolean }) {
  return <div className={`metric ${featured ? "featured" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function TabButton({ id, active, count, onClick, onKeyDown, children }: {
  id: TabId;
  active: TabId;
  count: number;
  onClick: (id: TabId) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, id: TabId) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      id={`tab-${id}`}
      role="tab"
      aria-controls="team-panel"
      aria-selected={active === id}
      tabIndex={active === id ? 0 : -1}
      className={active === id ? "active" : ""}
      type="button"
      onClick={() => onClick(id)}
      onKeyDown={(event) => onKeyDown(event, id)}
    >
      {children}<span>{count}</span>
    </button>
  );
}

function TeamTable({ teams }: { teams: EstimatedTeam[] }) {
  if (teams.length === 0) return <div className="no-rows"><Icon name="users" /><strong>No Teams Here</strong><span>Choose another status to continue.</span></div>;

  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th scope="col">Status</th><th scope="col">Rank</th><th scope="col">Team</th><th scope="col">LV</th><th scope="col">DVV</th><th scope="col">Source</th><th scope="col">Registered</th><th scope="col">Notes</th></tr></thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.id}>
              <td data-label="Status"><span className={`status ${team.status}`}>{team.status === "automatic" ? "Direct" : team.status}</span></td>
              <td data-label="Rank" className="rank-cell">{team.predictedRank ?? "—"}</td>
              <td data-label="Team">
                <strong>{team.players.length > 0 ? <span className="player-links">{team.players.map((player, index) => <span key={player.userId || `${team.id}-${player.name}`}>{index > 0 ? " / " : ""}{player.userId ? <a href={`https://www.beachvolleybb.de/popup/beach/beachTeamMemberDetails.xhtml?userId=${player.userId}&hideHistoryBackButton=true`} target="_blank" rel="noreferrer">{player.name}<span className="sr-only"> (opens in a new tab)</span></a> : player.name}</span>)}</span> : team.displayName}</strong>
                <span className="cell-secondary">{team.club || "Club not listed"}</span>
              </td>
              <td data-label="LV">{team.lvPoints}</td><td data-label="DVV">{team.dvvPoints}</td><td data-label="Source">{team.sourceBucket}</td><td data-label="Registered">{team.registeredAt || "—"}</td><td data-label="Notes">{team.notes.length ? team.notes.join(" ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" /><path d="M7 18c5-7 12-10 19-8M8 23c6-5 12-6 18-4M16 3c-1 8 2 15 10 21" /></svg>;
}

function HeroVisual({ version }: { version: DesignVersion }) {
  if (version === "v2") return <div className="hero-art sun-ticket" aria-hidden="true"><span className="sun" /><span className="net" /><b>PLAY<br />THE<br />SUNSET</b></div>;
  if (version === "v3") return <div className="hero-art scoreboard" aria-hidden="true"><span>COURT 01</span><b>24</b><i>TEAMS WATCHED</i></div>;
  if (version === "v4") return <div className="hero-art wave-mark" aria-hidden="true"><span /><span /><span /><b>BB</b></div>;
  if (version === "v5") return <div className="hero-art official-stamp" aria-hidden="true"><span>BB</span><b>ENTRY<br />SERVICE</b><i>EST. 2026</i></div>;
  return <div className="hero-art court-plan" aria-hidden="true"><span className="court-line center" /><span className="court-line left" /><span className="court-line right" /><i className="ball" /></div>;
}

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    "arrow-left": <><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    "chevron-right": <path d="m9 18 6-6-6-6" />,
    external: <><path d="M14 5h5v5" /><path d="m10 14 9-9" /><path d="M19 13v6H5V5h6" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    spark: <><path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></>,
    trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6" /></>,
    users: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 19c0-4 2.5-6 6-6s6 2 6 6M15 14c3.5 0 6 1.5 6 5" /></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
