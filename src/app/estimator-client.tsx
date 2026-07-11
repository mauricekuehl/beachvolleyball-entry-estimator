"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EstimateResponse, EstimatedTeam, SubscriptionCategory, SubscriptionGender } from "@/lib/types";

type ApiError = {
  error: string;
  code: string;
};

type Mode = "estimate" | "subscribe";
type SubscriptionStatus = { kind: "success" | "error"; message: string } | null;

const CATEGORY_OPTIONS = ["Premium", "A+", "A", "B", "C"] as const satisfies readonly SubscriptionCategory[];
const GENDER_OPTIONS = [
  { value: "male", label: "Männer" },
  { value: "female", label: "Frauen" },
  { value: "mixed", label: "Mixed" },
] as const satisfies readonly { value: SubscriptionGender; label: string }[];

const BEACHVOLLEYBB_TOURNAMENT_PATH = "/cms/home/beachtour/erwachsene/turniere.xhtml";

export function EstimatorClient({ initialTournamentId }: { initialTournamentId?: string }) {
  const router = useRouter();
  const initialTournamentUrl = initialTournamentId ? buildBeachvolleyBbTournamentUrl(initialTournamentId) : "";
  const [mode, setMode] = useState<Mode>("estimate");
  const [url, setUrl] = useState(initialTournamentUrl);
  const [result, setResult] = useState<EstimateResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<SubscriptionCategory[]>([...CATEGORY_OPTIONS]);
  const [selectedGender, setSelectedGender] = useState<SubscriptionGender>("male");
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>(null);
  const [shareStatus, setShareStatus] = useState("");

  const loadEstimate = useCallback(async (tournamentUrl: string) => {
    setLoading(true);
    setResult(null);
    setError(null);
    setShareStatus("");

    try {
      const response = await fetch("/api/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tournamentUrl }),
      });
      const payload = (await response.json()) as EstimateResponse | ApiError;

      if (!response.ok) {
        setError(payload as ApiError);
        return;
      }

      setResult(payload as EstimateResponse);
    } catch {
      setError({
        error: "Die Schätzung konnte nicht erreicht werden.",
        code: "NETWORK_ERROR",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialTournamentId) return;

    const timer = window.setTimeout(() => {
      void loadEstimate(buildBeachvolleyBbTournamentUrl(initialTournamentId));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialTournamentId, loadEstimate]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tournamentId = extractTournamentId(url);

    if (!tournamentId) {
      setError({
        error: "Die URL muss eine BeachvolleyBB-Turnier-ID enthalten.",
        code: "MISSING_TOURNEY_ID",
      });
      return;
    }

    setError(null);
    setResult(null);
    router.replace(buildTournamentAppPath(tournamentId));
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
          message: payload.error || "Das Abo konnte nicht gespeichert werden.",
        });
        return;
      }

      setSubscriptionStatus({
        kind: "success",
        message: "Abo gespeichert.",
      });
    } catch {
      setSubscriptionStatus({
        kind: "error",
        message: "Der Abo-Dienst konnte nicht erreicht werden.",
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

  async function copyShareLink() {
    if (!result) return;

    const shareUrl = `${window.location.origin}${buildTournamentAppPath(result.tournament.id)}`;
    try {
      await copyToClipboard(shareUrl);
      setShareStatus("Link kopiert.");
    } catch {
      setShareStatus("Link konnte nicht kopiert werden.");
    }
  }

  return (
    <main className="shell">
      <section className="intro">
        <div>
          <p className="eyebrow">Beach Tour Berlin-Brandenburg</p>
          <h1>Turnier-Tools</h1>
        </div>
        <div className="mode-actions" aria-label="Tool auswählen">
          <button
            className={mode === "estimate" ? "active" : ""}
            type="button"
            aria-pressed={mode === "estimate"}
            onClick={() => setMode("estimate")}
          >
            Zulassung schätzen
          </button>
          <button
            className={mode === "subscribe" ? "active" : ""}
            type="button"
            aria-pressed={mode === "subscribe"}
            onClick={() => setMode("subscribe")}
          >
            Neue Turniere abonnieren
          </button>
        </div>
      </section>

      {mode === "estimate" ? (
        <>
          <form className="url-form" onSubmit={submit}>
            <input
              aria-label="BeachvolleyBB-Turnier-URL"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.beachvolleybb.de/cms/home/beachtour/erwachsene/turniere.xhtml?BeachTourneyComponent.tourneyId=..."
            />
            <button type="submit" disabled={loading || !url.trim()}>
              {loading ? "Wird geschätzt" : "Schätzen"}
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
              <section className="summary-grid" aria-label="Turnierübersicht">
                <Metric label="Turnier" value={result.tournament.name} />
                <Metric label="Kategorie" value={result.tournament.categoryLabel || result.tournament.category} />
                <Metric label="Datum" value={result.tournament.date || "Unbekannt"} />
                <Metric label="Zulassungsplätze" value={String(result.tournament.automaticCapacity)} />
                <Metric label="Wildcards" value={String(result.tournament.wildcardMainDraw)} />
                <Metric label="Meldungen" value={String(result.allTeams.length)} />
              </section>

              <section className="rule-panel">
                <strong>{result.ruleSummary}</strong>
                <span>Abgerufen: {new Date(result.dataSources.fetchedAt).toLocaleString("de-DE")}</span>
              </section>

              <section className="result-actions" aria-label="Turnieraktionen">
                <a className="external-link-button" href={result.tournament.url} target="_blank" rel="noreferrer">
                  BVV Online öffnen
                </a>
                <details className="share-menu">
                  <summary aria-label="Teilen" title="Teilen">
                    <ShareIcon />
                  </summary>
                  <div className="share-popover">
                    <button type="button" onClick={copyShareLink}>
                      Link kopieren
                    </button>
                    {shareStatus ? <span>{shareStatus}</span> : null}
                  </div>
                </details>
              </section>

              <section className="table-section">
                <div className="tabs" role="tablist" aria-label="Schätzansicht">
                  <button className="active" type="button">
                    Alle <span>{result.allTeams.length}</span>
                  </button>
                </div>
                <TeamTable teams={result.allTeams} showSourceBucket={shouldShowSourceBucket(result)} />
              </section>
            </>
          ) : (
            <section className="empty-state">
              Füge einen öffentlichen Erwachsenen-Turnierlink von beachvolleybb.de ein, um die Zulassung aus den
              Meldungen zu schätzen.
            </section>
          )}
        </>
      ) : (
        <section className="subscribe-panel">
          <p className="subscribe-copy">
            Sendet eine E-Mail, wenn neue Turniere in den ausgewählten Kategorien veröffentlicht werden.
          </p>
          <form className="subscribe-form" onSubmit={submitSubscription}>
            <div className="field-group">
              <span className="field-label">Geschlecht</span>
              <div className="choice-list" role="radiogroup" aria-label="Turniergeschlecht">
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
              <span className="field-label">Kategorien</span>
              <div className="category-list" aria-label="Turnierkategorien">
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
                aria-label="E-Mail-Adresse"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="du@example.com"
              />
              <button type="submit" disabled={subscriptionLoading || !email.trim() || selectedCategories.length === 0}>
                {subscriptionLoading ? "Wird gespeichert" : "Abonnieren"}
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

      <footer className="contact-note">Kontakt: main@mauricekuehl.com</footer>
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

function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M15.5 5.5 12 2 8.5 5.5" />
      <path d="M12 2v13" />
      <path d="M6 10H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
    </svg>
  );
}

function TeamTable({ teams, showSourceBucket }: { teams: EstimatedTeam[]; showSourceBucket: boolean }) {
  if (teams.length === 0) {
    return <div className="no-rows">Keine Teams in dieser Ansicht.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Rang</th>
            <th>Team</th>
            <th>LV</th>
            <th>DVV</th>
            {showSourceBucket ? <th>Wertung</th> : null}
            <th>Angemeldet</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.id}>
              <td data-label="Status">
                <span className={`status ${team.status}`}>{formatStatus(team.status)}</span>
              </td>
              <td data-label="Rang">{team.predictedRank ?? "-"}</td>
              <td data-label="Team">
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
              <td data-label="LV">{team.lvPoints}</td>
              <td data-label="DVV">{team.dvvPoints}</td>
              {showSourceBucket ? <td data-label="Wertung">{formatSourceBucket(team.sourceBucket)}</td> : null}
              <td data-label="Angemeldet">{team.registeredAt || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shouldShowSourceBucket(result: EstimateResponse): boolean {
  return result.tournament.category === "Premium" || result.tournament.category === "A+" || result.tournament.category === "A";
}

function buildBeachvolleyBbTournamentUrl(tournamentId: string): string {
  const url = new URL(BEACHVOLLEYBB_TOURNAMENT_PATH, "https://www.beachvolleybb.de");
  url.searchParams.set("BeachTourneyComponent.view", "registrations");
  url.searchParams.set("BeachTourneyComponent.tourneyId", tournamentId);
  return url.toString();
}

function buildTournamentAppPath(tournamentId: string): string {
  return `/tournament?id=${encodeURIComponent(tournamentId)}`;
}

function extractTournamentId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    const beachvolleyId = parsed.searchParams.get("BeachTourneyComponent.tourneyId");
    const appId = parsed.searchParams.get("id");
    const id = beachvolleyId || appId;
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed.");
    }
  } finally {
    textarea.remove();
  }
}

function formatStatus(status: EstimatedTeam["status"]): string {
  switch (status) {
    case "automatic":
      return "Zugelassen";
    case "waitlist":
      return "Warteliste";
    case "unresolved":
      return "Ungeklärt";
  }
}

function formatSourceBucket(sourceBucket: EstimatedTeam["sourceBucket"]): string {
  switch (sourceBucket) {
    case "DVV":
      return "DVV";
    case "LV":
      return "Landesverband";
    case "INVERSE_LV":
      return "Inverse LV-Wertung";
    case "UNRESOLVED":
      return "Ungeklärt";
  }
}
