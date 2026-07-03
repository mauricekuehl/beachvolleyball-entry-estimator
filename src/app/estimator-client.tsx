"use client";

import { FormEvent, useMemo, useState } from "react";
import type { EstimateResponse, EstimatedTeam, SubscriptionCategory, SubscriptionGender } from "@/lib/types";

type ApiError = {
  error: string;
  code: string;
};

type Mode = "estimate" | "subscribe";
type TabId = "automatic" | "waitlist" | "all" | "unresolved";
type SubscriptionStatus = { kind: "success" | "error"; message: string } | null;

const CATEGORY_OPTIONS = ["Premium", "A+", "A", "B", "C"] as const satisfies readonly SubscriptionCategory[];
const GENDER_OPTIONS = [
  { value: "male", label: "Men" },
  { value: "female", label: "Women" },
  { value: "mixed", label: "Mixed" },
] as const satisfies readonly { value: SubscriptionGender; label: string }[];

export function EstimatorClient() {
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
      setError({
        error: "Could not reach the estimator API.",
        code: "NETWORK_ERROR",
      });
    } finally {
      setLoading(false);
    }
  }

  async function submitSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubscriptionLoading(true);
    setSubscriptionStatus(null);

    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, categories: selectedCategories, gender: selectedGender }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok) {
        setSubscriptionStatus({
          kind: "error",
          message: payload.error || "Could not save the subscription.",
        });
        return;
      }

      setSubscriptionStatus({
        kind: "success",
        message: "Subscription saved.",
      });
    } catch {
      setSubscriptionStatus({
        kind: "error",
        message: "Could not reach the subscription API.",
      });
    } finally {
      setSubscriptionLoading(false);
    }
  }

  function toggleCategory(category: SubscriptionCategory) {
    setSelectedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  }

  const visibleTeams = useMemo(() => {
    if (!result) return [];
    if (activeTab === "automatic") return result.automatic;
    if (activeTab === "waitlist") return result.waitlist;
    if (activeTab === "unresolved") return result.unresolved;
    return result.allTeams;
  }, [activeTab, result]);

  return (
    <main className="shell">
      <section className="intro">
        <div>
          <p className="eyebrow">Beach Tour Berlin-Brandenburg</p>
          <h1>Tournament tools</h1>
        </div>
        <div className="mode-actions" aria-label="Choose tool">
          <button
            className={mode === "estimate" ? "active" : ""}
            type="button"
            aria-pressed={mode === "estimate"}
            onClick={() => setMode("estimate")}
          >
            Estimate Zulassung
          </button>
          <button
            className={mode === "subscribe" ? "active" : ""}
            type="button"
            aria-pressed={mode === "subscribe"}
            onClick={() => setMode("subscribe")}
          >
            Subscribe to new tournaments
          </button>
        </div>
      </section>

      {mode === "estimate" ? (
        <>
          <form className="url-form" onSubmit={submit}>
            <input
              aria-label="BeachvolleyBB tournament URL"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.beachvolleybb.de/cms/home/beachtour/erwachsene/turniere.xhtml?BeachTourneyComponent.tourneyId=..."
            />
            <button type="submit" disabled={loading || !url.trim()}>
              {loading ? "Estimating" : "Estimate"}
            </button>
          </form>

          {error ? (
            <section className="notice error">
              <strong>{error.error}</strong>
              <span>{error.code}</span>
            </section>
          ) : null}

          {result ? (
            <>
              <section className="summary-grid" aria-label="Tournament summary">
                <Metric label="Tournament" value={result.tournament.name} />
                <Metric label="Category" value={result.tournament.categoryLabel || result.tournament.category} />
                <Metric label="Date" value={result.tournament.date || "Unknown"} />
                <Metric label="Automatic spots" value={String(result.tournament.automaticCapacity)} />
                <Metric label="Wildcards" value={String(result.tournament.wildcardMainDraw)} />
                <Metric label="Registrations" value={String(result.allTeams.length)} />
              </section>

              <section className="rule-panel">
                <strong>{result.ruleSummary}</strong>
                <span>Fetched {new Date(result.dataSources.fetchedAt).toLocaleString()}</span>
              </section>

              <section className="table-section">
                <div className="tabs" role="tablist" aria-label="Estimate views">
                  <TabButton id="automatic" active={activeTab} count={result.automatic.length} onClick={setActiveTab}>
                    Automatic
                  </TabButton>
                  <TabButton id="waitlist" active={activeTab} count={result.waitlist.length} onClick={setActiveTab}>
                    Waitlist
                  </TabButton>
                  <TabButton id="all" active={activeTab} count={result.allTeams.length} onClick={setActiveTab}>
                    All
                  </TabButton>
                  <TabButton id="unresolved" active={activeTab} count={result.unresolved.length} onClick={setActiveTab}>
                    Unresolved
                  </TabButton>
                </div>
                <TeamTable teams={visibleTeams} />
              </section>
            </>
          ) : (
            <section className="empty-state">
              Paste a public adult tournament link from beachvolleybb.de to estimate automatic entry from registrations.
            </section>
          )}
        </>
      ) : (
        <section className="subscribe-panel">
          <p className="subscribe-copy">
            Sends an email when new tournaments are published in the selected categories.
          </p>
          <form className="subscribe-form" onSubmit={submitSubscription}>
            <div className="field-group">
              <span className="field-label">Gender</span>
              <div className="choice-list" role="radiogroup" aria-label="Tournament gender">
                {GENDER_OPTIONS.map((gender) => (
                  <button
                    key={gender.value}
                    type="button"
                    role="radio"
                    className={`choice-row ${selectedGender === gender.value ? "active" : ""}`}
                    aria-checked={selectedGender === gender.value}
                    onClick={() => setSelectedGender(gender.value)}
                  >
                    <span>{gender.label}</span>
                    <span className="radio-mark" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            <div className="field-group">
              <span className="field-label">Categories</span>
              <div className="category-list" aria-label="Tournament categories">
                {CATEGORY_OPTIONS.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`category-row ${selectedCategories.includes(category) ? "active" : ""}`}
                    aria-pressed={selectedCategories.includes(category)}
                    onClick={() => toggleCategory(category)}
                  >
                    <span>{category}</span>
                    <span className="toggle-switch" aria-hidden="true">
                      <span />
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="email-row">
              <input
                aria-label="Email address"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <button type="submit" disabled={subscriptionLoading || !email.trim() || selectedCategories.length === 0}>
                {subscriptionLoading ? "Saving" : "Subscribe"}
              </button>
            </div>
          </form>

          {subscriptionStatus ? (
            <section className={`notice ${subscriptionStatus.kind}`}>
              <strong>{subscriptionStatus.message}</strong>
            </section>
          ) : null}
        </section>
      )}

      <footer className="contact-note">Contact: main@mauricekuehl.com</footer>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TabButton({
  id,
  active,
  count,
  onClick,
  children,
}: {
  id: TabId;
  active: TabId;
  count: number;
  onClick: (id: TabId) => void;
  children: React.ReactNode;
}) {
  return (
    <button className={active === id ? "active" : ""} type="button" onClick={() => onClick(id)}>
      {children} <span>{count}</span>
    </button>
  );
}

function TeamTable({ teams }: { teams: EstimatedTeam[] }) {
  if (teams.length === 0) {
    return <div className="no-rows">No teams in this view.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Rank</th>
            <th>Team</th>
            <th>LV</th>
            <th>DVV</th>
            <th>Source</th>
            <th>Registered</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.id}>
              <td>
                <span className={`status ${team.status}`}>{team.status}</span>
              </td>
              <td>{team.predictedRank ?? "-"}</td>
              <td>
                <strong>
                  {team.players.length > 0 ? (
                    <span className="player-links">
                      {team.players.map((player, index) => (
                        <span key={player.userId || `${team.id}-${player.name}`}>
                          {index > 0 ? " / " : ""}
                          {player.userId ? (
                            <a
                              href={`https://www.beachvolleybb.de/popup/beach/beachTeamMemberDetails.xhtml?userId=${player.userId}&hideHistoryBackButton=true`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {player.name}
                            </a>
                          ) : (
                            player.name
                          )}
                        </span>
                      ))}
                    </span>
                  ) : (
                    team.displayName
                  )}
                </strong>
                <span>{team.club}</span>
              </td>
              <td>{team.lvPoints}</td>
              <td>{team.dvvPoints}</td>
              <td>{team.sourceBucket}</td>
              <td>{team.registeredAt || "-"}</td>
              <td>{team.notes.length ? team.notes.join(" ") : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
