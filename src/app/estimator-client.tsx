"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Bell, Check, ExternalLink, Search, Share2 } from "lucide-react";
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
  const [shareStatus, setShareStatus] = useState<SubscriptionStatus>(null);
  const [sharing, setSharing] = useState(false);

  const loadEstimate = useCallback(async (tournamentUrl: string) => {
    setLoading(true);
    setResult(null);
    setError(null);
    setShareStatus(null);

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
        message: "Benachrichtigungen aktiviert.",
      });
    } catch {
      setSubscriptionStatus({
        kind: "error",
        message: "Der Benachrichtigungsdienst konnte nicht erreicht werden.",
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
    if (!result || sharing) return;

    const shareUrl = `${window.location.origin}${buildTournamentAppPath(result.tournament.id)}`;
    setSharing(true);
    setShareStatus(null);
    try {
      await copyToClipboard(shareUrl);
      setShareStatus({ kind: "success", message: "Link kopiert" });
    } catch {
      setShareStatus({ kind: "error", message: "Link konnte nicht kopiert werden" });
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="shell">
      <section className="intro">
        <div>
          <p className="eyebrow">Beach Tour Berlin-Brandenburg</p>
          <h1>Turnier-Tools</h1>
        </div>
        <nav className="mode-actions" aria-label="Werkzeug auswählen">
          <button
            className={mode === "estimate" ? "active" : ""}
            type="button"
            aria-pressed={mode === "estimate"}
            onClick={() => setMode("estimate")}
          >
            <Search aria-hidden="true" />
            <span>Zulassung</span>
          </button>
          <button
            className={mode === "subscribe" ? "active" : ""}
            type="button"
            aria-pressed={mode === "subscribe"}
            onClick={() => setMode("subscribe")}
          >
            <Bell aria-hidden="true" />
            <span>Benachrichtigungen</span>
          </button>
        </nav>
      </section>

      {mode === "estimate" ? (
        <>
          <form className="url-form" onSubmit={submit}>
            <label className="visually-hidden" htmlFor="tournament-url">
              BeachvolleyBB-Turnier-URL
            </label>
            <input
              id="tournament-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.beachvolleybb.de/…tourneyId=…"
              inputMode="url"
              autoComplete="url"
            />
            <button type="submit" disabled={loading || !url.trim()} aria-busy={loading}>
              {loading ? "Wird geschätzt …" : "Zulassung schätzen"}
            </button>
          </form>

          {error ? (
            <section className="notice error" role="alert">
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
                <a className="action-button external-link-button" href={result.tournament.url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  <span>BVV öffnen</span>
                </a>
                <div className="share-action">
                  <button
                    className="action-button share-button"
                    type="button"
                    onClick={copyShareLink}
                    disabled={sharing}
                    aria-busy={sharing}
                  >
                    <Share2 aria-hidden="true" />
                    <span>{sharing ? "Wird kopiert …" : "Teilen"}</span>
                  </button>
                  <span
                    className={`share-feedback ${shareStatus?.kind || ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    {shareStatus?.message || ""}
                  </span>
                </div>
              </section>

              <section className="table-section" aria-label="Voraussichtliche Zulassungsreihenfolge">
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
            Erhalte eine E-Mail, wenn neue Turniere in den ausgewählten Kategorien veröffentlicht werden.
          </p>
          <form className="subscribe-form" onSubmit={submitSubscription}>
            <fieldset className="selection-group">
              <legend>1. Turnierart</legend>
              <div className="choice-list" role="radiogroup" aria-label="Turnierart">
                {GENDER_OPTIONS.map((gender) => {
                  const selected = selectedGender === gender.value;
                  return (
                    <button
                      key={gender.value}
                      type="button"
                      role="radio"
                      className={`selection-button ${selected ? "active" : ""}`}
                      aria-checked={selected}
                      onClick={() => setSelectedGender(gender.value)}
                    >
                      {selected ? <Check aria-hidden="true" /> : null}
                      <span>{gender.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="selection-group">
              <legend>2. Kategorien</legend>
              <div className="category-list" aria-label="Turnierkategorien">
                {CATEGORY_OPTIONS.map((category) => {
                  const selected = selectedCategories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`selection-button ${selected ? "active" : ""}`}
                      aria-pressed={selected}
                      onClick={() => toggleCategory(category)}
                    >
                      <span>{category}</span>
                      {selected ? <Check aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="selection-group email-group">
              <legend>3. E-Mail-Adresse</legend>
              <div className="email-row">
                <label className="visually-hidden" htmlFor="notification-email">
                  E-Mail-Adresse
                </label>
                <input
                  id="notification-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="du@example.com"
                  autoComplete="email"
                />
                <button
                  type="submit"
                  disabled={subscriptionLoading || !email.trim() || selectedCategories.length === 0}
                  aria-busy={subscriptionLoading}
                >
                  {subscriptionLoading ? "Wird aktiviert …" : "Benachrichtigungen aktivieren"}
                </button>
              </div>
            </fieldset>
          </form>

          {subscriptionStatus ? (
            <section className={`notice ${subscriptionStatus.kind}`} role="status">
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
    try {
      await Promise.race([
        navigator.clipboard.writeText(value),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Clipboard timeout")), 1200)),
      ]);
      return;
    } catch {
      // Embedded browsers can expose the API without resolving it. Fall back to the selection-based copy below.
    }
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
