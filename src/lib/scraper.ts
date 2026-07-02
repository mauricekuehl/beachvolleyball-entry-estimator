import * as cheerio from "cheerio";
import type {
  Player,
  PlayerRanking,
  PublishedTournament,
  RankingSource,
  RegisteredTeam,
  TournamentCategory,
  TournamentGender,
  TournamentMetadata,
} from "./types";
import { EstimateError } from "./types";

const BASE_URL = "https://www.beachvolleybb.de";
const TOURNAMENT_PATH = "/cms/home/beachtour/erwachsene/turniere.xhtml";
export const TOURNAMENT_OVERVIEW_URL = `${BASE_URL}${TOURNAMENT_PATH}`;
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

  const teams = await hydrateRegisteredTeams(registeredTeams, tournament, cachedFetcher);
  return { tournament, teams };
}

export async function scrapePublishedTournaments(fetcher: Fetcher = fetchUncachedText): Promise<PublishedTournament[]> {
  const cachedFetcher = createCachedFetcher(fetcher);
  const html = await cachedFetcher(TOURNAMENT_OVERVIEW_URL);
  return parsePublishedTournaments(html);
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

export function parsePlayerDetails(html: string, gender: TournamentGender, preferredSeason?: number): Player {
  const $ = cheerio.load(html);
  const titleName = normalizeWhitespace($("h2").first().text() || $("title").first().text());
  const rankings = parseRankingRows(html);
  const genderLabel = rankingGenderLabel(gender);

  return {
    userId: "",
    name: titleName || "Unknown player",
    dvvLicense: extractDvvLicense($),
    lvRanking: pickBestRanking(rankings, "LV", genderLabel, preferredSeason),
    dvvRanking: pickBestRanking(rankings, "DVV", genderLabel, preferredSeason),
  };
}

export function parseRankingRows(html: string): PlayerRanking[] {
  const $ = cheerio.load(html);
  const rankings: PlayerRanking[] = [];
  const rankingTables = $(".samsContentBox")
    .filter((_, box) => normalizeLabel($(box).find(".samsContentBoxHeader").first().text()) === "ranglistenplätze")
    .find("table");
  const tables = rankingTables.length > 0 ? rankingTables : $("table");

  tables.find("tbody tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((__, cell) => normalizeWhitespace($(cell).text()))
      .get();
    if (cells.length !== 5 || !/^\d{4}$/.test(cells[0])) return;

    const season = parseInteger(cells[0]);
    const label = cells[1];
    const date = cells[2];
    const points = parseInteger(cells[4]);
    if (!season || !/^\d{2}\.\d{2}\.\d{4}$/.test(date) || points == null) return;

    rankings.push({
      source: isDvvRankingLabel(label) ? "DVV" : "LV",
      season,
      label,
      points,
      place: parseInteger(cells[3]),
      date,
    });
  });

  return rankings;
}

export function parsePublishedTournaments(html: string): PublishedTournament[] {
  const $ = cheerio.load(html);
  const tournaments: PublishedTournament[] = [];

  $("table").each((_, table) => {
    const headers = $(table)
      .find("thead th")
      .map((__, th) => normalizeLabel($(th).text()))
      .get();
    const categoryIndex = headers.findIndex((header) => header === "kategorie");
    const tournamentIndex = headers.findIndex((header) => header === "turnier");
    const dateIndex = headers.findIndex((header) => header.includes("start"));
    const locationIndex = headers.findIndex((header) => header === "ort");
    const genderIndex = headers.findIndex((header) => header === "m/w");
    const teamsIndex = headers.findIndex((header) => header === "teams");
    const registrationIndex = headers.findIndex((header) => header === "anmeldung");
    if (categoryIndex === -1 || tournamentIndex === -1) return;

    $(table)
      .find("tbody tr")
      .each((__, row) => {
        const cells = $(row).find("td");
        const tournamentCell = cells.eq(tournamentIndex);
        const tournamentLink = tournamentCell
          .find("a[href*='BeachTourneyComponent.tourneyId=']")
          .first();
        const href = tournamentLink.attr("href") ?? "";
        const id = href.match(/BeachTourneyComponent\.tourneyId=(\d+)/)?.[1];
        if (!id) return;

        const categoryLabel = normalizeWhitespace(cells.eq(categoryIndex).text());
        tournaments.push({
          id,
          name: normalizeWhitespace(tournamentLink.text() || tournamentCell.text()),
          category: parseCategory(categoryLabel),
          categoryLabel,
          url: buildTournamentUrl(id, "summary"),
          date: dateIndex >= 0 ? normalizeWhitespace(cells.eq(dateIndex).text()) : "",
          location: locationIndex >= 0 ? normalizeWhitespace(cells.eq(locationIndex).text()) : "",
          gender: genderIndex >= 0 ? normalizeWhitespace(cells.eq(genderIndex).text()) : "",
          teams: teamsIndex >= 0 ? normalizeWhitespace(cells.eq(teamsIndex).text()) : "",
          registrationState: registrationIndex >= 0 ? normalizeWhitespace(cells.eq(registrationIndex).text()) : "",
        });
      });
  });

  return tournaments;
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
  tournament: TournamentMetadata,
  fetcher: Fetcher,
): Promise<RegisteredTeam[]> {
  const preferredSeason = parseSeason(tournament.date);

  return Promise.all(
    teams.map(async (team) => {
      const teamDetails = await fetcher(teamDetailUrl(team.id))
        .then(parseTeamDetails)
        .catch(() => ({ players: [], notes: ["Could not fetch public team details."] }));

      const players = await Promise.all(
        teamDetails.players.map(async (player) => {
          const parsed = await fetcher(playerDetailUrl(player.userId))
            .then((html) => parsePlayerDetails(html, tournament.gender, preferredSeason))
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

  const html = await response.text();
  if (!url.includes("/popup/beach/beachTeamMemberDetails.xhtml")) {
    return html;
  }

  return appendPaginatedRankingRows(url, html, response.headers);
}

async function appendPaginatedRankingRows(url: string, html: string, headers: Headers): Promise<string> {
  const $ = cheerio.load(html);
  const rankingBox = $(".samsContentBox").filter(
    (_, box) => normalizeLabel($(box).find(".samsContentBoxHeader").first().text()) === "ranglistenplätze",
  );
  const tableWidget = rankingBox.find(".ui-datatable").first();
  const tableId = tableWidget.attr("id");
  const current = normalizeWhitespace(tableWidget.find(".ui-paginator-current").first().text());
  const [, pageSizeText, totalText] = current.match(/Daten\s+1-(\d+)\/(\d+)/) ?? [];
  const pageSize = parseInteger(pageSizeText);
  const total = parseInteger(totalText);
  const viewState = $("input[name='jakarta.faces.ViewState']").attr("value");
  const cookieHeader = cookieHeaderFrom(headers);

  if (!tableId || !viewState || !cookieHeader || !pageSize || !total || total <= pageSize) {
    return html;
  }

  let nextViewState = viewState;
  const tbody = $(`[id="${tableId}_data"]`);

  for (let first = pageSize; first < total; first += pageSize) {
    const pageHtml = await fetchPrimeFacesDataTablePage(url, tableId, first, pageSize, nextViewState, cookieHeader);
    const page = cheerio.load(pageHtml, { xmlMode: true });
    const update = page(`update[id="${tableId}"]`).text();
    const updatedViewState = page("update[id$='jakarta.faces.ViewState:0']").text();
    if (update) {
      tbody.append(update);
    }
    if (updatedViewState) {
      nextViewState = updatedViewState;
    }
  }

  return $.html();
}

async function fetchPrimeFacesDataTablePage(
  url: string,
  tableId: string,
  first: number,
  rows: number,
  viewState: string,
  cookieHeader: string,
): Promise<string> {
  const body = new URLSearchParams({
    "jakarta.faces.partial.ajax": "true",
    "jakarta.faces.source": tableId,
    "jakarta.faces.partial.execute": tableId,
    "jakarta.faces.partial.render": tableId,
    teamMemberDetailForm: "teamMemberDetailForm",
    [tableId]: tableId,
    [`${tableId}_pagination`]: "true",
    [`${tableId}_first`]: String(first),
    [`${tableId}_rows`]: String(rows),
    [`${tableId}_skipChildren`]: "true",
    [`${tableId}_encodeFeature`]: "true",
    "jakarta.faces.ViewState": viewState,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/xml, text/xml, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "faces-request": "partial/ajax",
      "x-requested-with": "XMLHttpRequest",
      cookie: cookieHeader,
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new EstimateError(`BeachvolleyBB returned ${response.status} for ${url}.`, 502, "UPSTREAM_FETCH");
  }

  return response.text();
}

function cookieHeaderFrom(headers: Headers): string {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(headers) : [headers.get("set-cookie") ?? ""];
  return setCookies
    .filter(Boolean)
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
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
  preferredSeason?: number,
): PlayerRanking | null {
  let candidates = rankings.filter((ranking) => {
    const label = ranking.label.toLowerCase();
    if (source === "DVV") {
      return ranking.source === "DVV" && label.includes(genderLabel);
    }
    return label.includes("bb | erwachsene") && label.includes(genderLabel);
  });

  const season = preferredSeason ?? Math.max(...candidates.map((ranking) => ranking.season));
  if (Number.isFinite(season)) {
    candidates = candidates.filter((ranking) => ranking.season === season);
  }

  return candidates
    .sort((a, b) => {
      const pointDiff = b.points - a.points;
      if (pointDiff !== 0) return pointDiff;
      return rankingLabelPriority(a.label, source) - rankingLabelPriority(b.label, source);
    })[0] ?? null;
}

function rankingGenderLabel(gender: TournamentGender): string {
  if (gender === "female") return "frauen";
  if (gender === "mixed") return "mixed";
  return "männer";
}

function isDvvRankingLabel(label: string): boolean {
  const normalized = label.toLowerCase();
  return normalized.includes("dvv-rangliste") || normalized.includes("(dvv)");
}

function rankingLabelPriority(label: string, source: RankingSource): number {
  const normalized = label.toLowerCase();
  if (source === "DVV" && normalized.includes("dvv-rangliste")) return 0;
  if (source === "LV" && normalized.includes("bb | erwachsene")) return 0;
  return 1;
}

function parseSeason(value: string): number | undefined {
  const match = value.match(/\b(20\d{2})\b/);
  if (!match) return undefined;
  const season = Number(match[1]);
  return Number.isFinite(season) ? season : undefined;
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
