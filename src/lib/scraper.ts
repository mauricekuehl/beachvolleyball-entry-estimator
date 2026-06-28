import * as cheerio from "cheerio";
import type {
  Player,
  PlayerRanking,
  RegisteredTeam,
  TournamentCategory,
  TournamentGender,
  TournamentMetadata,
} from "./types";
import { EstimateError } from "./types";

const BASE_URL = "https://www.beachvolleybb.de";
const TOURNAMENT_PATH = "/cms/home/beachtour/erwachsene/turniere.xhtml";
const USER_AGENT =
  "beachvolleyball-entry-estimator/1.0 (+https://github.com/mauricekuehl/beachvolleyball-entry-estimator)";
export const EXTERNAL_HTML_CACHE_TTL_MS = 15 * 60 * 1000;

type ViewName = "summary" | "details" | "registrations" | "admissions";
type Fetcher = (url: string) => Promise<string>;
type CacheEntry = {
  expiresAt: number;
  html?: string;
  pending?: Promise<string>;
};

const externalHtmlCache = new Map<string, CacheEntry>();

export function parseTournamentUrl(rawUrl: string): { id: string; normalizedUrl: string } {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new EstimateError("Paste a valid BeachvolleyBB tournament URL.", 400, "INVALID_URL");
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "www.beachvolleybb.de" && host !== "beachvolleybb.de") {
    throw new EstimateError("Only beachvolleybb.de tournament links are supported.", 400, "INVALID_DOMAIN");
  }

  const id = parsed.searchParams.get("BeachTourneyComponent.tourneyId");
  if (!id || !/^\d+$/.test(id)) {
    throw new EstimateError("The URL must contain a BeachTourneyComponent.tourneyId value.", 400, "MISSING_TOURNEY_ID");
  }

  return {
    id,
    normalizedUrl: buildTournamentUrl(id, "summary"),
  };
}

export function buildTournamentUrl(id: string, view: ViewName): string {
  const url = new URL(TOURNAMENT_PATH, BASE_URL);
  url.searchParams.set("BeachTourneyComponent.view", view);
  url.searchParams.set("BeachTourneyComponent.tourneyId", id);
  return `${url.toString()}#samsCmsComponent_49930769`;
}

export async function scrapeBeachvolleyBb(rawUrl: string, fetcher: Fetcher = fetchUncachedText) {
  const cachedFetcher = createCachedFetcher(fetcher);
  const { id, normalizedUrl } = parseTournamentUrl(rawUrl);
  const [summaryHtml, detailsHtml, admissionsHtml, registrationsHtml] = await Promise.all([
    cachedFetcher(buildTournamentUrl(id, "summary")),
    cachedFetcher(buildTournamentUrl(id, "details")),
    cachedFetcher(buildTournamentUrl(id, "admissions")),
    cachedFetcher(buildTournamentUrl(id, "registrations")),
  ]);

  if (isAdmissionPublished(admissionsHtml)) {
    throw new EstimateError(
      "The Zulassungsliste is already publicly available.",
      409,
      "ADMISSIONS_ALREADY_PUBLIC",
    );
  }

  const tournament = parseTournamentMetadata({
    id,
    url: normalizedUrl,
    summaryHtml,
    detailsHtml,
  });
  const registeredTeams = parseRegistrations(registrationsHtml);

  if (registeredTeams.length === 0) {
    throw new EstimateError("No public registrations were found for this tournament.", 404, "NO_REGISTRATIONS");
  }

  const teams = await hydrateRegisteredTeams(registeredTeams, tournament.gender, cachedFetcher);
  return { tournament, teams };
}

export function parseTournamentMetadata({
  id,
  url,
  summaryHtml,
  detailsHtml,
}: {
  id: string;
  url: string;
  summaryHtml: string;
  detailsHtml: string;
}): TournamentMetadata {
  const summary = parseKeyValueTable(summaryHtml);
  const details = parseKeyValueTable(detailsHtml);
  const categoryLabel = summary.get("turnierkategorie") ?? details.get("turnierkategorie") ?? "";
  const mainDrawTeams = parseInteger(summary.get("anzahl teams hauptfeld")) ?? 0;
  const wildcardMainDraw = parseInteger(details.get("anzahl wildcards hauptfeld")) ?? 0;

  if (!mainDrawTeams) {
    throw new EstimateError("Could not parse the main draw team count.", 502, "PARSE_MAIN_DRAW");
  }

  return {
    id,
    url,
    name: summary.get("turnier") ?? titleFromHtml(summaryHtml) ?? `Tournament ${id}`,
    category: parseCategory(categoryLabel),
    categoryLabel,
    gender: parseGender(summary.get("geschlecht") ?? ""),
    date: summary.get("datum") ?? "",
    registrationCount: parseInteger(summary.get("gemeldete mannschaften")),
    mainDrawTeams,
    qualificationTeams: parseInteger(summary.get("anzahl teams qualifikation")) ?? 0,
    wildcardMainDraw,
    automaticCapacity: Math.max(0, mainDrawTeams - wildcardMainDraw),
    admissionDate: details.get("zulassungstermin") ?? "",
  };
}

export function isAdmissionPublished(html: string): boolean {
  const $ = cheerio.load(html);
  const text = normalizeWhitespace($.root().text()).toLowerCase();
  if (text.includes("zulassungsliste fuer dieses turnier ist noch nicht veroeffentlicht")) {
    return false;
  }
  if (text.includes("zulassungsliste für dieses turnier ist noch nicht veröffentlicht")) {
    return false;
  }

  return $("a[href*='beachTeamDetails.xhtml?beachTeamId=']").length > 0;
}

export function parseRegistrations(html: string): RegisteredTeam[] {
  const $ = cheerio.load(html);
  const teams: RegisteredTeam[] = [];

  $("table").each((_, table) => {
    const headers = $(table)
      .find("thead th")
      .map((__, th) => normalizeLabel($(th).text()))
      .get();
    const teamIndex = headers.findIndex((header) => header === "mannschaft");
    const clubIndex = headers.findIndex((header) => header === "verein");
    const registeredIndex = headers.findIndex((header) => header === "angemeldet am");
    if (teamIndex === -1 || registeredIndex === -1) return;

    $(table)
      .find("tbody tr")
      .each((__, row) => {
        const cells = $(row).find("td");
        const teamCell = cells.eq(teamIndex);
        const link = teamCell.find("a[href*='beachTeamDetails.xhtml?beachTeamId=']").first();
        const href = link.attr("href") ?? "";
        const id = href.match(/beachTeamId=(\d+)/)?.[1];
        if (!id) return;

        teams.push({
          id,
          displayName: normalizeWhitespace(teamCell.text()),
          club: clubIndex >= 0 ? normalizeWhitespace(cells.eq(clubIndex).text()) : "",
          registeredAt: normalizeWhitespace(cells.eq(registeredIndex).text()),
          players: [],
          notes: [],
        });
      });
  });

  if (teams.length === 0) {
    $("a[href*='beachTeamDetails.xhtml?beachTeamId=']").each((_, link) => {
      const href = $(link).attr("href") ?? "";
      const id = href.match(/beachTeamId=(\d+)/)?.[1];
      if (!id || teams.some((team) => team.id === id)) return;

      const row = $(link).closest("tr");
      const cells = row.find("td");
      teams.push({
        id,
        displayName: normalizeWhitespace($(link).text()),
        club: normalizeWhitespace(cells.eq(2).text()),
        registeredAt: normalizeWhitespace(cells.last().text()),
        players: [],
        notes: [],
      });
    });
  }

  return teams;
}

export function parseTeamDetails(html: string): Pick<RegisteredTeam, "players" | "notes"> {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const players: Player[] = [];

  $("a[href*='beachTeamMemberDetails.xhtml?userId=']").each((_, link) => {
    const href = $(link).attr("href") ?? "";
    const userId = href.match(/userId=(\d+)/)?.[1];
    const name = normalizeWhitespace($(link).text());
    if (!userId || !name || seen.has(userId)) return;
    seen.add(userId);
    players.push({
      userId,
      name,
      dvvLicense: null,
      lvRanking: null,
      dvvRanking: null,
    });
  });

  return {
    players: players.slice(0, 2),
    notes: players.length < 2 ? ["Could not resolve both public player profiles."] : [],
  };
}

export function parsePlayerDetails(html: string, gender: TournamentGender): Player {
  const $ = cheerio.load(html);
  const titleName = normalizeWhitespace($("h2").first().text() || $("title").first().text());
  const rankings = parseRankingRows(html);
  const genderLabel = rankingGenderLabel(gender);

  return {
    userId: "",
    name: titleName || "Unknown player",
    dvvLicense: extractDvvLicense($),
    lvRanking: pickBestRanking(rankings, "LV", genderLabel),
    dvvRanking: pickBestRanking(rankings, "DVV", genderLabel),
  };
}

export function parseRankingRows(html: string): PlayerRanking[] {
  const $ = cheerio.load(html);
  const rankings: PlayerRanking[] = [];

  $("tbody tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((__, cell) => normalizeWhitespace($(cell).text()))
      .get();
    if (cells.length !== 5 || !/^\d{4}$/.test(cells[0])) return;

    const label = cells[1];
    const points = parseInteger(cells[4]);
    if (points == null) return;

    rankings.push({
      source: label.toLowerCase().includes("dvv-rangliste") ? "DVV" : "LV",
      label,
      points,
      place: parseInteger(cells[3]),
      date: cells[2],
    });
  });

  return rankings;
}

export function parseCategory(label: string): TournamentCategory {
  const normalized = normalizeWhitespace(label).toLowerCase();
  if (normalized.includes("premium")) return "Premium";
  if (normalized.includes("a+")) return "A+";
  if (normalized.includes("kategorie a") || /\ba\b/.test(normalized)) return "A";
  if (normalized.includes("kategorie b") || /\bb\b/.test(normalized)) return "B";
  if (normalized.includes("kategorie c") || /\bc\b/.test(normalized)) return "C";
  return "Unknown";
}

export function parseGender(label: string): TournamentGender {
  const normalized = normalizeWhitespace(label).toLowerCase();
  if (normalized.includes("mixed")) return "mixed";
  if (normalized.includes("maennlich") || normalized.includes("männlich") || normalized.includes("(m)")) return "male";
  if (normalized.includes("weiblich") || normalized.includes("(w)")) return "female";
  return "unknown";
}

export function teamDetailUrl(teamId: string): string {
  return `${BASE_URL}/popup/beach/beachTeamDetails.xhtml?beachTeamId=${teamId}&hideHistoryBackButton=true`;
}

export function playerDetailUrl(userId: string): string {
  return `${BASE_URL}/popup/beach/beachTeamMemberDetails.xhtml?userId=${userId}&hideHistoryBackButton=true`;
}

export function clearExternalHtmlCacheForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("clearExternalHtmlCacheForTests can only be used in tests.");
  }
  externalHtmlCache.clear();
}

async function hydrateRegisteredTeams(
  teams: RegisteredTeam[],
  gender: TournamentGender,
  fetcher: Fetcher,
): Promise<RegisteredTeam[]> {
  return Promise.all(
    teams.map(async (team) => {
      const teamDetails = await fetcher(teamDetailUrl(team.id))
        .then(parseTeamDetails)
        .catch(() => ({ players: [], notes: ["Could not fetch public team details."] }));

      const players = await Promise.all(
        teamDetails.players.map(async (player) => {
          const parsed = await fetcher(playerDetailUrl(player.userId))
            .then((html) => parsePlayerDetails(html, gender))
            .catch(() => null);

          return parsed
            ? { ...parsed, userId: player.userId, name: parsed.name || player.name }
            : { ...player, name: player.name, lvRanking: null, dvvRanking: null };
        }),
      );

      return {
        ...team,
        players,
        notes: [...team.notes, ...teamDetails.notes],
      };
    }),
  );
}

function createCachedFetcher(fetcher: Fetcher): Fetcher {
  return async function fetchCachedText(url: string): Promise<string> {
    const now = Date.now();
    const cached = externalHtmlCache.get(url);
    if (cached && cached.expiresAt > now) {
      if (cached.html != null) return cached.html;
      if (cached.pending) return cached.pending;
    }

    const pending = fetcher(url);
    externalHtmlCache.set(url, {
      expiresAt: now + EXTERNAL_HTML_CACHE_TTL_MS,
      pending,
    });

    try {
      const html = await pending;
      externalHtmlCache.set(url, {
        expiresAt: Date.now() + EXTERNAL_HTML_CACHE_TTL_MS,
        html,
      });
      return html;
    } catch (error) {
      externalHtmlCache.delete(url);
      throw error;
    }
  };
}

async function fetchUncachedText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new EstimateError(`BeachvolleyBB returned ${response.status} for ${url}.`, 502, "UPSTREAM_FETCH");
  }

  return response.text();
}

function parseKeyValueTable(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const values = new Map<string, string>();

  $("table tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length < 2) return;
    const key = normalizeLabel(cells.eq(0).text());
    const value = normalizeWhitespace(cells.eq(1).text());
    if (key && value && !values.has(key)) {
      values.set(key, value);
    }
  });

  return values;
}

function pickBestRanking(
  rankings: PlayerRanking[],
  source: "DVV" | "LV",
  genderLabel: string,
): PlayerRanking | null {
  const candidates = rankings.filter((ranking) => {
    const label = ranking.label.toLowerCase();
    if (source === "DVV") {
      return ranking.source === "DVV" && label.includes(genderLabel);
    }
    return label.includes("bb | erwachsene") && label.includes(genderLabel);
  });

  return candidates.sort((a, b) => b.points - a.points)[0] ?? null;
}

function rankingGenderLabel(gender: TournamentGender): string {
  if (gender === "female") return "frauen";
  if (gender === "mixed") return "mixed";
  return "männer";
}

function titleFromHtml(html: string): string | null {
  const $ = cheerio.load(html);
  const header = normalizeWhitespace($(".samsCmsComponentHeader").first().text());
  return header || null;
}

function extractDvvLicense($: cheerio.CheerioAPI): string | null {
  let license: string | null = null;

  $("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length < 2) return;
    const key = normalizeLabel(cells.eq(0).text());
    if (key === "dvv-lizenznummer") {
      const value = normalizeWhitespace(cells.eq(1).text());
      license = value && value !== "-" ? value : null;
    }
  });

  return license;
}

function normalizeLabel(value: string): string {
  return normalizeWhitespace(value).replace(/:$/, "").toLowerCase();
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\u200b|\u200c|\u200d|\u2060/g, "").replace(/\s+/g, " ").trim();
}

export function parseInteger(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/[^\d-]/g, "");
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
