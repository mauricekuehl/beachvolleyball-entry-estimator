import { describe, expect, it } from "vitest";
import {
  isAdmissionPublished,
  parsePlayerDetails,
  parseRegistrations,
  parseTeamDetails,
  parseTournamentMetadata,
} from "../lib/scraper";

describe("scraper parsers", () => {
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
});
