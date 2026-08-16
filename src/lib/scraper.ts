import * as cheerio from "cheerio";
import { parseGenderLabel } from "./gender";
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
const ACCEPT_LANGUAGE = "de-DE,de;q=0.9";
// SAMS renders labels in the visitor's language, but the CDN in front of it caches responses without
// varying on Accept-Language. A single English visitor can therefore poison the shared cache entry.
// Requesting an extra query parameter gives us our own cache key, so we reliably get German labels.
const LOCALE_CACHE_PARAM = "estimatorLang";

type ViewName = "summary" | "details" | "registrations" | "admissions";
type Fetcher = (url: string) => Promise<string>;
type CacheEntry = {
  expiresAt: number;
  html?: string;
  pending?: Promise<string>;
};

const externalHtmlCache = new Map<string, CacheEntry>();

// SAMS labels can arrive in German or English (see LOCALE_CACHE_PARAM), so every lookup accepts both.
const LABELS = {
  tournament: ["turnier", "tournament"],
  category: ["turnierkategorie", "tournament categories"],
  gender: ["geschlecht", "sex"],
  date: ["datum", "date"],
  registrationCount: ["gemeldete mannschaften", "enrolled teams"],
  mainDrawTeams: ["anzahl teams hauptfeld", "number of teams main tournament"],
  qualificationTeams: ["anzahl teams qualifikation", "number of team qualification"],
  wildcards: ["anzahl wildcards hauptfeld", "number of wildcards main tournament"],
  admissionDate: ["zulassungstermin", "admission date"],
  dvvLicense: ["dvv-lizenznummer", "dvv license number"],
  team: ["mannschaft", "team"],
  club: ["verein", "club"],
  registeredAt: ["angemeldet am", "registered at"],
  status: ["status"],
  doubleRegistration: ["doppelmeldung", "double registration"],
  admissionDetails: ["punkte", "zulassung", "points", "admission"],
  overviewCategory: ["kategorie", "category"],
  overviewLocation: ["ort", "place"],
  overviewGender: ["m/w", "m./f."],
  overviewTeams: ["teams"],
  overviewRegistration: ["anmeldung", "registration"],
  rankingBox: ["ranglistenplätze", "ranking list position"],
} as const;

export function parseTournamentUrl(rawUrl: string): { id: string; normalizedUrl: string } {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new EstimateError("Füge eine gültige BeachvolleyBB-Turnier-URL ein.", 400, "INVALID_URL");
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "www.beachvolleybb.de" && host !== "beachvolleybb.de") {
    throw new EstimateError("Es werden nur Turnierlinks von beachvolleybb.de unterstützt.", 400, "INVALID_DOMAIN");
  }

  const id = parsed.searchParams.get("BeachTourneyComponent.tourneyId");
  if (!id || !/^\d+$/.test(id)) {
    throw new EstimateError("Die URL muss eine BeachTourneyComponent.tourneyId enthalten.", 400, "MISSING_TOURNEY_ID");
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
  const [summaryHtml, detailsHtml, admissionsHtml] = await Promise.all([
    cachedFetcher(buildTournamentUrl(id, "summary")),
    cachedFetcher(buildTournamentUrl(id, "details")),
    cachedFetcher(buildTournamentUrl(id, "admissions")),
  ]);

  const tournament = parseTournamentMetadata({
    id,
    url: normalizedUrl,
    summaryHtml,
    detailsHtml,
  });
  const admissionsPublished = isAdmissionPublished(admissionsHtml);
  const listedTeams = admissionsPublished
    ? parseAdmissions(admissionsHtml)
    : parseRegistrations(await cachedFetcher(buildTournamentUrl(id, "registrations")));

  if (listedTeams.length === 0) {
    throw new EstimateError(
      admissionsPublished
        ? "Die veröffentlichte Zulassungsliste konnte nicht ausgelesen werden."
        : "Für dieses Turnier wurden keine öffentlichen Meldungen gefunden.",
      admissionsPublished ? 502 : 404,
      admissionsPublished ? "PARSE_ADMISSIONS" : "NO_REGISTRATIONS",
    );
  }

  const teams = await hydrateRegisteredTeams(listedTeams, tournament, cachedFetcher);
  return { tournament, teams, admissionsPublished };
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
  const categoryLabel =
    readValue(summary, LABELS.category) ?? readValue(details, LABELS.category) ?? "";
  const mainDrawTeams = parseInteger(readValue(summary, LABELS.mainDrawTeams)) ?? 0;
  const wildcardMainDraw = parseInteger(readValue(details, LABELS.wildcards)) ?? 0;

  if (!mainDrawTeams) {
    throw new EstimateError("Die Anzahl der Hauptfeldteams konnte nicht ausgelesen werden.", 502, "PARSE_MAIN_DRAW");
  }

  return {
    id,
    url,
    name: readValue(summary, LABELS.tournament) ?? titleFromHtml(summaryHtml) ?? `Turnier ${id}`,
    category: parseCategory(categoryLabel),
    categoryLabel,
    gender: parseGenderLabel(readValue(summary, LABELS.gender) ?? ""),
    date: readValue(summary, LABELS.date) ?? "",
    registrationCount: parseInteger(readValue(summary, LABELS.registrationCount)),
    mainDrawTeams,
    qualificationTeams: parseInteger(readValue(summary, LABELS.qualificationTeams)) ?? 0,
    wildcardMainDraw,
    automaticCapacity: Math.max(0, mainDrawTeams - wildcardMainDraw),
    admissionDate: readValue(details, LABELS.admissionDate) ?? "",
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
    const teamIndex = findHeaderIndex(headers, LABELS.team);
    const clubIndex = findHeaderIndex(headers, LABELS.club);
    const registeredIndex = findHeaderIndex(headers, LABELS.registeredAt);
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

export function parseAdmissions(html: string): RegisteredTeam[] {
  const $ = cheerio.load(html);
  const teams: RegisteredTeam[] = [];

  $("table").each((_, table) => {
    const headers = $(table)
      .find("thead th")
      .map((__, th) => normalizeLabel($(th).text()))
      .get();
    const rankIndex = headers.findIndex((header) => header === "#");
    const teamIndex = findHeaderIndex(headers, LABELS.team);
    const clubIndex = findHeaderIndex(headers, LABELS.club);
    const statusIndex = findHeaderIndex(headers, LABELS.status);
    const doubleRegistrationIndex = findPartialHeaderIndex(headers, LABELS.doubleRegistration);
    const detailsIndex = findPartialHeaderIndex(headers, LABELS.admissionDetails);
    if (teamIndex === -1 || statusIndex === -1) return;

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
          registeredAt: "",
          players: [],
          notes: [],
          admission: {
            rank: rankIndex >= 0 ? parseInteger(normalizeWhitespace(cells.eq(rankIndex).text())) : null,
            status: normalizeWhitespace(cells.eq(statusIndex).text()),
            doubleRegistration:
              doubleRegistrationIndex >= 0 ? normalizeWhitespace(cells.eq(doubleRegistrationIndex).text()) : "",
            details: detailsIndex >= 0 ? normalizeWhitespace(cells.eq(detailsIndex).text()) : "",
          },
        });
      });
  });

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
    notes: players.length < 2 ? ["Nicht beide öffentlichen Spielerprofile konnten aufgelöst werden."] : [],
  };
}

export function parsePlayerDetails(html: string, gender: TournamentGender, preferredSeason?: number): Player {
  const $ = cheerio.load(html);
  const titleName = normalizeWhitespace($("h2").first().text() || $("title").first().text());
  const rankings = parseRankingRows(html);
  const genderLabel = rankingGenderLabel(gender);

  return {
    userId: "",
    name: titleName || "Unbekannter Spieler",
    dvvLicense: extractDvvLicense($),
    lvRanking: pickBestRanking(rankings, "LV", genderLabel, preferredSeason),
    dvvRanking: pickBestRanking(rankings, "DVV", genderLabel, preferredSeason),
  };
}

export function parseRankingRows(html: string): PlayerRanking[] {
  const $ = cheerio.load(html);
  const rankings: PlayerRanking[] = [];
  const rankingTables = $(".samsContentBox")
    .filter((_, box) => isRankingBoxHeader(normalizeLabel($(box).find(".samsContentBoxHeader").first().text())))
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
    const categoryIndex = findHeaderIndex(headers, LABELS.overviewCategory);
    const tournamentIndex = findHeaderIndex(headers, LABELS.tournament);
    const dateIndex = headers.findIndex((header) => header.includes("start"));
    const locationIndex = findHeaderIndex(headers, LABELS.overviewLocation);
    const genderIndex = findHeaderIndex(headers, LABELS.overviewGender);
    const teamsIndex = findHeaderIndex(headers, LABELS.overviewTeams);
    const registrationIndex = findHeaderIndex(headers, LABELS.overviewRegistration);
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
  if (normalized.includes("landesmeister")) return "LM";
  if (normalized.includes("premium")) return "Premium";
  if (normalized.includes("a+")) return "A+";
  if (normalized.includes("kategorie a") || /\ba\b/.test(normalized)) return "A";
  if (normalized.includes("kategorie b") || /\bb\b/.test(normalized)) return "B";
  if (normalized.includes("kategorie c") || /\bc\b/.test(normalized)) return "C";
  return "Unknown";
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
        .catch(() => ({ players: [], notes: ["Öffentliche Teamdetails konnten nicht abgerufen werden."] }));

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
  const response = await fetch(germanLocaleUrl(url), {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
      "accept-language": ACCEPT_LANGUAGE,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new EstimateError(`BeachvolleyBB hat ${response.status} für ${url} zurückgegeben.`, 502, "UPSTREAM_FETCH");
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
    (_, box) => isRankingBoxHeader(normalizeLabel($(box).find(".samsContentBoxHeader").first().text())),
  );
  const tableWidget = rankingBox.find(".ui-datatable").first();
  const tableId = tableWidget.attr("id");
  const current = normalizeWhitespace(tableWidget.find(".ui-paginator-current").first().text());
  const [, pageSizeText, totalText] = current.match(/(?:Daten|Data)\s+1-(\d+)\/(\d+)/) ?? [];
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

  const response = await fetch(germanLocaleUrl(url), {
    method: "POST",
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/xml, text/xml, */*; q=0.01",
      "accept-language": ACCEPT_LANGUAGE,
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "faces-request": "partial/ajax",
      "x-requested-with": "XMLHttpRequest",
      cookie: cookieHeader,
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new EstimateError(`BeachvolleyBB hat ${response.status} für ${url} zurückgegeben.`, 502, "UPSTREAM_FETCH");
  }

  return response.text();
}

function germanLocaleUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(LOCALE_CACHE_PARAM, "de");
    return parsed.toString();
  } catch {
    return url;
  }
}

function cookieHeaderFrom(headers: Headers): string {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(headers) : [headers.get("set-cookie") ?? ""];
  return setCookies
    .filter(Boolean)
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function isRankingBoxHeader(header: string): boolean {
  return (LABELS.rankingBox as readonly string[]).includes(header);
}

function readValue(values: Map<string, string>, labels: readonly string[]): string | undefined {
  for (const label of labels) {
    const value = values.get(label);
    if (value) return value;
  }

  return undefined;
}

function findHeaderIndex(headers: string[], labels: readonly string[]): number {
  return headers.findIndex((header) => labels.some((label) => header === label));
}

function findPartialHeaderIndex(headers: string[], labels: readonly string[]): number {
  return headers.findIndex((header) => labels.some((label) => header.includes(label)));
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
    if ((LABELS.dvvLicense as readonly string[]).includes(key)) {
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
