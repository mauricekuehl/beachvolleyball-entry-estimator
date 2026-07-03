import { describe, expect, it } from "vitest";
import { parseGenderLabel } from "../lib/gender";
import {
  isAdmissionPublished,
  parsePublishedTournaments,
  parsePlayerDetails,
  parseRankingRows,
  parseRegistrations,
  parseTeamDetails,
  parseTournamentMetadata,
} from "../lib/scraper";

describe("scraper parsers", () => {
  it("normalizes overview gender labels", () => {
    expect(parseGenderLabel("m")).toBe("male");
    expect(parseGenderLabel("w")).toBe("female");
    expect(parseGenderLabel("Mixed")).toBe("mixed");
  });

  it("parses tournament metadata from summary and details tables", () => {
    const summaryHtml = `
      <h1 class="samsCmsComponentHeader">Beachfreunde A+Cup(m)</h1>
      <table>
        <tr><td>Turnier: </td><td>Beachfreunde A+Cup(m)</td></tr>
        <tr><td>Turnierkategorie: </td><td>BB | Kategorie A+</td></tr>
        <tr><td>Datum: </td><td>25.07.2026 - 26.07.2026</td></tr>
        <tr><td>Geschlecht: </td><td>maennlich</td></tr>
        <tr><td>gemeldete Mannschaften: </td><td>4</td></tr>
        <tr><td>Anzahl Teams Hauptfeld: </td><td>24</td></tr>
        <tr><td>Anzahl Teams Qualifikation: </td><td>0</td></tr>
      </table>`;
    const detailsHtml = `<table><tr><td>Anzahl Wildcards Hauptfeld: </td><td>2</td></tr><tr><td>Zulassungstermin:</td><td>14.07.2026</td></tr></table>`;

    expect(
      parseTournamentMetadata({
        id: "121408184",
        url: "https://www.beachvolleybb.de/example",
        summaryHtml,
        detailsHtml,
      }),
    ).toMatchObject({
      name: "Beachfreunde A+Cup(m)",
      category: "A+",
      gender: "male",
      mainDrawTeams: 24,
      wildcardMainDraw: 2,
      automaticCapacity: 22,
    });
  });

  it("detects published and unpublished admissions", () => {
    expect(isAdmissionPublished("<p>Die Zulassungsliste für dieses Turnier ist noch nicht veröffentlicht.</p>")).toBe(
      false,
    );
    expect(isAdmissionPublished('<a href="popup/beach/beachTeamDetails.xhtml?beachTeamId=1">Team</a>')).toBe(true);
  });

  it("parses registration rows", () => {
    const teams = parseRegistrations(`
      <table>
        <thead><tr><th>#</th><th>Mannschaft</th><th>Verein</th><th>angemeldet am</th></tr></thead>
        <tbody><tr>
          <td>1</td>
          <td><a href="popup/beach/beachTeamDetails.xhtml?beachTeamId=121713749">B. Belkin / L. Rose</a></td>
          <td>TSGL Schöneiche/TSGL Schöneiche</td>
          <td>23.06.2026, 20:12</td>
        </tr></tbody>
      </table>`);

    expect(teams).toHaveLength(1);
    expect(teams[0]).toMatchObject({
      id: "121713749",
      displayName: "B. Belkin / L. Rose",
      registeredAt: "23.06.2026, 20:12",
    });
  });

  it("parses team and player detail pages", () => {
    const team = parseTeamDetails(`
      <a href="popup/beach/beachTeamMemberDetails.xhtml?userId=26562896">Belkin, Bastian</a>
      <a href="popup/beach/beachTeamMemberDetails.xhtml?userId=48841118">Rose, Luka</a>`);
    expect(team.players.map((player) => player.name)).toEqual(["Belkin, Bastian", "Rose, Luka"]);

    const player = parsePlayerDetails(
      `
      <h2>Rose, Luka</h2>
      <table><tbody>
        <tr><td>2026</td><td>DVV-Rangliste Männer</td><td>22.06.2026</td><td>412</td><td>8</td></tr>
        <tr><td>2026</td><td>BB | Erwachsene Männer</td><td>22.06.2026</td><td>23</td><td>397</td></tr>
      </tbody></table>`,
      "male",
    );
    expect(player.lvRanking?.points).toBe(397);
    expect(player.dvvRanking?.points).toBe(8);
  });

  it("only parses ranking rows from the ranking places section", () => {
    const rankings = parseRankingRows(`
      <div class="samsContentBox">
        <div class="samsContentBoxHeader">Ranglistenplätze</div>
        <div class="samsContentBoxContent">
          <table><tbody>
            <tr><td>2026</td><td>DVV-Rangliste Männer</td><td>29.06.2026</td><td>532</td><td>4</td></tr>
            <tr><td>2026</td><td>BB | Erwachsene Männer</td><td>29.06.2026</td><td>31</td><td>327</td></tr>
          </tbody></table>
        </div>
      </div>
      <div class="samsContentBox">
        <div class="samsContentBoxHeader">Turnierpunkte</div>
        <div class="samsContentBoxContent">
          <table><tbody>
            <tr><td>2026</td><td>BB | Erwachsene Männer</td><td>Vorsaisonpunkte</td><td>Vorsaison</td><td>36</td></tr>
          </tbody></table>
        </div>
      </div>`);

    expect(rankings.map((ranking) => [ranking.label, ranking.points])).toEqual([
      ["DVV-Rangliste Männer", 4],
      ["BB | Erwachsene Männer", 327],
    ]);
  });

  it("prefers the tournament season over higher historical DVV points", () => {
    const player = parsePlayerDetails(
      `
      <h2>Ollech, Robert</h2>
      <div class="samsContentBox">
        <div class="samsContentBoxHeader">Ranglistenplätze</div>
        <div class="samsContentBoxContent">
          <table><tbody>
            <tr><td>2024</td><td>DVV-Rangliste Männer</td><td>29.06.2026</td><td>441</td><td>6</td></tr>
            <tr><td>2026</td><td>HVbV | Rangliste Männer (DVV)</td><td>29.06.2026</td><td>532</td><td>4</td></tr>
            <tr><td>2026</td><td>DVV-Rangliste Männer</td><td>29.06.2026</td><td>532</td><td>4</td></tr>
            <tr><td>2026</td><td>BB | Erwachsene Männer</td><td>29.06.2026</td><td>31</td><td>327</td></tr>
          </tbody></table>
        </div>
      </div>`,
      "male",
      2026,
    );

    expect(player.dvvRanking?.season).toBe(2026);
    expect(player.dvvRanking?.points).toBe(4);
    expect(player.lvRanking?.points).toBe(327);
  });

  it("parses published tournament overview rows", () => {
    const tournaments = parsePublishedTournaments(`
      <table id="samsBeachTourneyOverviewComponentTourneyTable">
        <thead>
          <tr>
            <th>Kategorie</th>
            <th>Turnier</th>
            <th>Start / Meldeschluss</th>
            <th>Ort</th>
            <th>m/w</th>
            <th>Teams</th>
            <th>Anmeldung</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>BB | Kategorie A+</td>
            <td>
              <a href="/cms/home/beachtour/erwachsene/turniere.xhtml?BeachTourneyComponent.tourneyId=121408184">
                Beachfreunde A+Cup(m)
              </a>
            </td>
            <td>25.07.2026 / 14.07.2026</td>
            <td>Berlin</td>
            <td>m</td>
            <td>12/24</td>
            <td>offen</td>
          </tr>
        </tbody>
      </table>`);

    expect(tournaments).toEqual([
      {
        id: "121408184",
        name: "Beachfreunde A+Cup(m)",
        category: "A+",
        categoryLabel: "BB | Kategorie A+",
        url: "https://www.beachvolleybb.de/cms/home/beachtour/erwachsene/turniere.xhtml?BeachTourneyComponent.view=summary&BeachTourneyComponent.tourneyId=121408184#samsCmsComponent_49930769",
        date: "25.07.2026 / 14.07.2026",
        location: "Berlin",
        gender: "m",
        teams: "12/24",
        registrationState: "offen",
      },
    ]);
  });
});
