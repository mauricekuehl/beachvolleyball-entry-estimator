"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardPaste,
  ExternalLink,
  Link2,
  Mail,
  Menu,
  Search,
  Share2,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react";
import type { EstimateResponse, EstimatedTeam, SubscriptionCategory, SubscriptionGender } from "@/lib/types";

type ApiError = { error: string; code: string };
type Mode = "estimate" | "subscribe";
type SubscriptionStatus = { kind: "success" | "error"; message: string } | null;
export type DesignVariant = "v1" | "v2" | "v3" | "v4" | "v5";

const CATEGORY_OPTIONS = ["Premium", "A+", "A", "B", "C"] as const satisfies readonly SubscriptionCategory[];
const GENDER_OPTIONS = [
  { value: "male", label: "Männer" },
  { value: "female", label: "Frauen" },
  { value: "mixed", label: "Mixed" },
] as const satisfies readonly { value: SubscriptionGender; label: string }[];
const VERSIONS: DesignVariant[] = ["v1", "v2", "v3", "v4", "v5"];
const BEACHVOLLEYBB_TOURNAMENT_PATH = "/cms/home/beachtour/erwachsene/turniere.xhtml";

const VERSION_COPY: Record<DesignVariant, { name: string; hint: string }> = {
  v1: { name: "Klar", hint: "Reduziert auf das Wesentliche" },
  v2: { name: "Fokus", hint: "Suche zuerst, Details danach" },
  v3: { name: "Zentrale", hint: "Alle Werkzeuge im Blick" },
  v4: { name: "Geführt", hint: "In drei Schritten zum Ergebnis" },
  v5: { name: "Spielfeld", hint: "Expressiv und direkt" },
};

export function EstimatorClient({
  initialTournamentId,
  variant = "v1",
}: {
  initialTournamentId?: string;
  variant?: DesignVariant;
}) {
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
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);

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
      setError({ error: "Die Schätzung konnte nicht erreicht werden.", code: "NETWORK_ERROR" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialTournamentId) return;
    const timer = window.setTimeout(() => void loadEstimate(buildBeachvolleyBbTournamentUrl(initialTournamentId)), 0);
    return () => window.clearTimeout(timer);
  }, [initialTournamentId, loadEstimate]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tournamentId = extractTournamentId(url);
    if (!tournamentId) {
      setError({ error: "Füge einen gültigen BeachvolleyBB-Turnierlink ein.", code: "LINK_PRÜFEN" });
      return;
    }

    setError(null);
    setResult(null);
    router.replace(buildVersionPath(variant, tournamentId));
  }

  async function pasteLink() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text);
    } catch {
      setError({ error: "Der Browser hat keinen Zugriff auf die Zwischenablage.", code: "MANUELL_EINFÜGEN" });
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
        setSubscriptionStatus({ kind: "error", message: payload.error || "Das Abo konnte nicht gespeichert werden." });
        return;
      }
      setSubscriptionStatus({ kind: "success", message: "Abo gespeichert. Du verpasst kein neues Turnier." });
    } catch {
      setSubscriptionStatus({ kind: "error", message: "Der Abo-Dienst konnte nicht erreicht werden." });
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
    const shareUrl = `${window.location.origin}${buildVersionPath(variant, result.tournament.id)}`;
    try {
      await copyToClipboard(shareUrl);
      setShareStatus("Link kopiert");
    } catch {
      setShareStatus("Kopieren fehlgeschlagen");
    }
  }

  const versionCopy = VERSION_COPY[variant];

  return (
    <main className={`product-shell product-${variant} mode-${mode}`}>
      <div className="court-decoration" aria-hidden="true"><span /><span /><span /></div>

      <header className="topbar">
        <Link className="brand" href="/" aria-label="Zur Versionsauswahl">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-copy"><strong>Sideout</strong><small>BB Turnier-Tools</small></span>
        </Link>
        <div className="topbar-context">
          <span>{versionCopy.name}</span>
          <small>{versionCopy.hint}</small>
        </div>
        <nav className={`version-switcher ${versionMenuOpen ? "open" : ""}`} aria-label="Designversion wählen">
          {VERSIONS.map((version) => (
            <a key={version} href={`/${version}`} aria-current={version === variant ? "page" : undefined}>
              <span>{version.slice(1)}</span><small>{VERSION_COPY[version].name}</small>
            </a>
          ))}
        </nav>
        <button
          className="icon-button mobile-menu"
          type="button"
          aria-label={versionMenuOpen ? "Navigation schließen" : "Navigation öffnen"}
          aria-expanded={versionMenuOpen}
          onClick={() => setVersionMenuOpen((open) => !open)}
          title={versionMenuOpen ? "Navigation schließen" : "Navigation öffnen"}
        >
          {versionMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </header>

      <div className="app-frame">
        <aside className="tool-rail" aria-label="Werkzeuge">
          <div className="rail-label">Werkzeuge</div>
          <button className={mode === "estimate" ? "active" : ""} type="button" onClick={() => setMode("estimate")}>
            <Search aria-hidden="true" /><span><strong>Zulassung</strong><small>Chancen schätzen</small></span><ChevronRight aria-hidden="true" />
          </button>
          <button className={mode === "subscribe" ? "active" : ""} type="button" onClick={() => setMode("subscribe")}>
            <Bell aria-hidden="true" /><span><strong>Turnieralarm</strong><small>Neue Termine erhalten</small></span><ChevronRight aria-hidden="true" />
          </button>
          <div className="rail-tip">
            <CircleHelp aria-hidden="true" />
            <span><strong>Wo ist der Link?</strong><small>Öffne beim BVV die Meldeliste und kopiere die Adresse.</small></span>
          </div>
        </aside>

        <section className="workspace">
          <div className="mode-switch" aria-label="Werkzeug auswählen">
            <button type="button" className={mode === "estimate" ? "active" : ""} aria-pressed={mode === "estimate"} onClick={() => setMode("estimate")}>
              <Search aria-hidden="true" /> Zulassung
            </button>
            <button type="button" className={mode === "subscribe" ? "active" : ""} aria-pressed={mode === "subscribe"} onClick={() => setMode("subscribe")}>
              <Bell aria-hidden="true" /> Turnieralarm
            </button>
          </div>

          {mode === "estimate" ? (
            <>
              <section className="task-header">
                <div>
                  <p className="section-kicker"><Sparkles aria-hidden="true" /> Zulassungsschätzung</p>
                  <h1>Kommt euer Team ins Feld?</h1>
                  <p>Turnierlink einfügen. Wir ordnen die Meldeliste nach den aktuellen Zulassungsregeln.</p>
                </div>
                <div className="step-track" aria-label="Ablauf">
                  <span className="current"><b>1</b> Link</span><i /><span className={loading || result ? "current" : ""}><b>2</b> Prüfen</span><i /><span className={result ? "current" : ""}><b>3</b> Ergebnis</span>
                </div>
              </section>

              <form className="estimate-form" onSubmit={submit}>
                <label htmlFor={`tournament-url-${variant}`}>BeachvolleyBB-Turnierlink</label>
                <div className="input-cluster">
                  <Link2 className="input-icon" aria-hidden="true" />
                  <input
                    id={`tournament-url-${variant}`}
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="Turnierlink hier einfügen …"
                    autoComplete="url"
                    inputMode="url"
                  />
                  <button className="paste-button" type="button" onClick={pasteLink} title="Aus Zwischenablage einfügen">
                    <ClipboardPaste aria-hidden="true" /><span>Einfügen</span>
                  </button>
                  <button className="primary-action" type="submit" disabled={loading || !url.trim()}>
                    <span>{loading ? "Wird geprüft …" : "Jetzt schätzen"}</span><ArrowRight aria-hidden="true" />
                  </button>
                </div>
                <small>Funktioniert mit öffentlichen Erwachsenen-Turnieren auf beachvolleybb.de</small>
              </form>

              {error ? <Notice kind="error" title={error.error} detail={error.code} /> : null}
              {loading ? <LoadingState /> : null}
              {result ? <EstimateResult result={result} shareStatus={shareStatus} copyShareLink={copyShareLink} /> : null}
              {!result && !loading ? <EstimateEmptyState variant={variant} /> : null}
            </>
          ) : (
            <SubscriptionPanel
              email={email}
              setEmail={setEmail}
              selectedCategories={selectedCategories}
              selectedGender={selectedGender}
              toggleCategory={toggleCategory}
              setSelectedGender={setSelectedGender}
              submitSubscription={submitSubscription}
              loading={subscriptionLoading}
              status={subscriptionStatus}
            />
          )}
        </section>
      </div>

      <nav className="bottom-dock" aria-label="Werkzeuge">
        <button className={mode === "estimate" ? "active" : ""} type="button" onClick={() => setMode("estimate")}><Search aria-hidden="true" /><span>Schätzen</span></button>
        <button className={mode === "subscribe" ? "active" : ""} type="button" onClick={() => setMode("subscribe")}><Bell aria-hidden="true" /><span>Alarm</span></button>
        <Link href="/" aria-label="Version wechseln"><Menu aria-hidden="true" /><span>Versionen</span></Link>
      </nav>

      <footer><span>Sideout ist ein unabhängiges Tool.</span><a href="mailto:main@mauricekuehl.com">Feedback senden</a></footer>
    </main>
  );
}

function EstimateEmptyState({ variant }: { variant: DesignVariant }) {
  return (
    <section className="empty-guide">
      <div className="empty-visual" aria-hidden="true"><span>1</span><i /><span>2</span><i /><span><Check /></span></div>
      <div><strong>Noch keine Schätzung</strong><p>Ein Turnierlink genügt. Namen, Punkte und Meldestand lesen wir automatisch aus.</p></div>
      <a href="https://www.beachvolleybb.de/cms/home/beachtour/erwachsene/turniere.xhtml" target="_blank" rel="noreferrer">
        Turniere beim BVV finden <ExternalLink aria-hidden="true" />
      </a>
      {variant === "v5" ? <span className="expressive-note">Aufschlag → Link → Klarheit</span> : null}
    </section>
  );
}

function LoadingState() {
  return (
    <section className="loading-state" aria-live="polite">
      <span className="loading-ball" aria-hidden="true" />
      <div><strong>Meldeliste wird ausgewertet</strong><span>Punkte, Rangfolge und Feldgröße werden abgeglichen …</span></div>
    </section>
  );
}

function EstimateResult({ result, shareStatus, copyShareLink }: { result: EstimateResponse; shareStatus: string; copyShareLink: () => void }) {
  const automatic = result.allTeams.filter((team) => team.status === "automatic").length;
  const waitlist = result.allTeams.filter((team) => team.status === "waitlist").length;

  return (
    <div className="results-stack">
      <section className="result-hero">
        <div className="result-title">
          <span className="result-icon"><Trophy aria-hidden="true" /></span>
          <div><p>{result.tournament.categoryLabel || result.tournament.category}</p><h2>{result.tournament.name}</h2><span><CalendarDays aria-hidden="true" /> {result.tournament.date || "Datum unbekannt"}</span></div>
        </div>
        <div className="result-actions">
          <a href={result.tournament.url} target="_blank" rel="noreferrer" title="Turnier beim BVV öffnen"><ExternalLink aria-hidden="true" /><span>BVV öffnen</span></a>
          <button type="button" onClick={copyShareLink} title="Link zur Schätzung kopieren"><Share2 aria-hidden="true" /><span>Teilen</span></button>
          {shareStatus ? <em role="status">{shareStatus}</em> : null}
        </div>
      </section>

      <section className="metric-grid" aria-label="Turnierübersicht">
        <Metric icon={<Users />} label="Meldungen" value={String(result.allTeams.length)} />
        <Metric icon={<Check />} label="Direkt im Feld" value={String(automatic)} />
        <Metric icon={<Trophy />} label="Feldgröße" value={String(result.tournament.automaticCapacity)} />
        <Metric icon={<Sparkles />} label="Warteliste" value={String(waitlist)} />
      </section>

      <section className="rule-note">
        <span><CircleHelp aria-hidden="true" /></span>
        <div><strong>So wurde gerechnet</strong><p>{result.ruleSummary}</p></div>
        <small>Stand {new Date(result.dataSources.fetchedAt).toLocaleString("de-DE")}</small>
      </section>

      <section className="team-panel">
        <div className="team-panel-header"><div><h2>Voraussichtliche Rangliste</h2><p>Sortiert nach der angewendeten Zulassungsregel</p></div><span>{result.allTeams.length} Teams</span></div>
        <TeamTable teams={result.allTeams} showSourceBucket={shouldShowSourceBucket(result)} />
      </section>
    </div>
  );
}

function SubscriptionPanel({
  email,
  setEmail,
  selectedCategories,
  selectedGender,
  toggleCategory,
  setSelectedGender,
  submitSubscription,
  loading,
  status,
}: {
  email: string;
  setEmail: (value: string) => void;
  selectedCategories: SubscriptionCategory[];
  selectedGender: SubscriptionGender;
  toggleCategory: (category: SubscriptionCategory) => void;
  setSelectedGender: (gender: SubscriptionGender) => void;
  submitSubscription: (event: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  status: SubscriptionStatus;
}) {
  return (
    <section className="subscribe-workspace">
      <div className="subscribe-intro"><span><Bell aria-hidden="true" /></span><div><p className="section-kicker">Turnieralarm</p><h1>Neue Turniere, ohne ständig nachzusehen.</h1><p>Wähle Geschlecht und Kategorien. Wir melden uns, sobald etwas Neues online ist.</p></div></div>
      <form onSubmit={submitSubscription}>
        <fieldset>
          <legend>1. Turnierart</legend>
          <div className="segmented-control">
            {GENDER_OPTIONS.map((gender) => (
              <button key={gender.value} type="button" className={selectedGender === gender.value ? "active" : ""} aria-pressed={selectedGender === gender.value} onClick={() => setSelectedGender(gender.value)}>
                {selectedGender === gender.value ? <Check aria-hidden="true" /> : null}{gender.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>2. Kategorien</legend>
          <div className="category-chips">
            {CATEGORY_OPTIONS.map((category) => (
              <button key={category} type="button" className={selectedCategories.includes(category) ? "active" : ""} aria-pressed={selectedCategories.includes(category)} onClick={() => toggleCategory(category)}>
                <span>{category}</span>{selectedCategories.includes(category) ? <Check aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>3. Wohin dürfen wir schreiben?</legend>
          <div className="email-cluster"><Mail aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@beispiel.de" aria-label="E-Mail-Adresse" /><button type="submit" disabled={loading || !email.trim() || selectedCategories.length === 0}>{loading ? "Speichert …" : "Alarm aktivieren"}<ArrowRight aria-hidden="true" /></button></div>
        </fieldset>
      </form>
      <p className="privacy-note">Nur neue Turniere. Keine Werbung. Jederzeit mit einem Klick abbestellbar.</p>
      {status ? <Notice kind={status.kind} title={status.message} /> : null}
    </section>
  );
}

function Notice({ kind, title, detail }: { kind: "success" | "error"; title: string; detail?: string }) {
  return <section className={`notice ${kind}`} role={kind === "error" ? "alert" : "status"}><span>{kind === "error" ? <X /> : <Check />}</span><div><strong>{title}</strong>{detail ? <small>{detail}</small> : null}</div></section>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="metric"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function TeamTable({ teams, showSourceBucket }: { teams: EstimatedTeam[]; showSourceBucket: boolean }) {
  if (teams.length === 0) return <div className="no-rows">Noch keine Teams in dieser Ansicht.</div>;

  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Prognose</th><th>Rang</th><th>Team</th><th>LV</th><th>DVV</th>{showSourceBucket ? <th>Wertung</th> : null}<th>Gemeldet</th></tr></thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.id}>
              <td data-label="Prognose"><span className={`status ${team.status}`}><i />{formatStatus(team.status)}</span></td>
              <td data-label="Rang"><strong className="rank">{team.predictedRank ?? "–"}</strong></td>
              <td data-label="Team"><strong>{team.players.length > 0 ? <span className="player-links">{team.players.map((player, index) => <span key={player.userId || `${team.id}-${player.name}`}>{index > 0 ? " / " : ""}{player.userId ? <a href={`https://www.beachvolleybb.de/popup/beach/beachTeamMemberDetails.xhtml?userId=${player.userId}&hideHistoryBackButton=true`} target="_blank" rel="noreferrer">{player.name}</a> : player.name}</span>)}</span> : team.displayName}</strong><span className="club">{team.club}</span></td>
              <td data-label="LV">{team.lvPoints}</td><td data-label="DVV">{team.dvvPoints}</td>{showSourceBucket ? <td data-label="Wertung">{formatSourceBucket(team.sourceBucket)}</td> : null}<td data-label="Gemeldet">{team.registeredAt || "–"}</td>
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
  const tournamentUrl = new URL(BEACHVOLLEYBB_TOURNAMENT_PATH, "https://www.beachvolleybb.de");
  tournamentUrl.searchParams.set("BeachTourneyComponent.view", "registrations");
  tournamentUrl.searchParams.set("BeachTourneyComponent.tourneyId", tournamentId);
  return tournamentUrl.toString();
}

function buildVersionPath(variant: DesignVariant, tournamentId: string): string {
  return `/${variant}?id=${encodeURIComponent(tournamentId)}`;
}

function extractTournamentId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    const id = parsed.searchParams.get("BeachTourneyComponent.tourneyId") || parsed.searchParams.get("id");
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(value);
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Copy command failed.");
  } finally {
    textarea.remove();
  }
}

function formatStatus(status: EstimatedTeam["status"]): string {
  if (status === "automatic") return "Im Feld";
  if (status === "waitlist") return "Warteliste";
  return "Offen";
}

function formatSourceBucket(sourceBucket: EstimatedTeam["sourceBucket"]): string {
  if (sourceBucket === "LV") return "Landesverband";
  if (sourceBucket === "INVERSE_LV") return "Inverse LV";
  if (sourceBucket === "UNRESOLVED") return "Ungeklärt";
  return "DVV";
}
