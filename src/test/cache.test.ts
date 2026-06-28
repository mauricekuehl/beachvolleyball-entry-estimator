import { beforeEach, describe, expect, it } from "vitest";
import { clearExternalHtmlCacheForTests, scrapeBeachvolleyBb } from "../lib/scraper";

const tournamentUrl =
  "https://www.beachvolleybb.de/cms/home/beachtour/erwachsene/turniere.xhtml?BeachTourneyComponent.view=registrations&BeachTourneyComponent.tourneyId=121408184";

describe("external HTML cache", () => {
  beforeEach(() => {
    clearExternalHtmlCacheForTests();
  });

  it("deduplicates repeated estimation requests for 15 minutes", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      return htmlFor(url);
    };

    await scrapeBeachvolleyBb(tournamentUrl, fetcher);
    expect(calls).toHaveLength(7);

    await scrapeBeachvolleyBb(tournamentUrl, fetcher);
    expect(calls).toHaveLength(7);
  });
});

function htmlFor(url: string): string {
  if (url.includes("BeachTourneyComponent.view=summary")) {
    return `
      <table>
        <tr><td>Turnier: </td><td>Cache Cup</td></tr>
        <tr><td>Turnierkategorie: </td><td>BB | Kategorie B</td></tr>
        <tr><td>Datum: </td><td>25.07.2026</td></tr>
        <tr><td>Geschlecht: </td><td>maennlich</td></tr>
        <tr><td>Anzahl Teams Hauptfeld: </td><td>8</td></tr>
        <tr><td>Anzahl Teams Qualifikation: </td><td>0</td></tr>
      </table>`;
  }
  if (url.includes("BeachTourneyComponent.view=details")) {
    return `<table><tr><td>Anzahl Wildcards Hauptfeld: </td><td>0</td></tr></table>`;
  }
  if (url.includes("BeachTourneyComponent.view=admissions")) {
    return `<p>Die Zulassungsliste für dieses Turnier ist noch nicht veröffentlicht.</p>`;
  }
  if (url.includes("BeachTourneyComponent.view=registrations")) {
    return `
      <table>
        <thead><tr><th>#</th><th>Mannschaft</th><th>Verein</th><th>angemeldet am</th></tr></thead>
        <tbody>
          <tr>
            <td>1</td>
            <td><a href="popup/beach/beachTeamDetails.xhtml?beachTeamId=1">A. One / B. Two</a></td>
            <td>Club</td>
            <td>23.06.2026, 20:12</td>
          </tr>
        </tbody>
      </table>`;
  }
  if (url.includes("beachTeamDetails.xhtml?beachTeamId=1")) {
    return `
      <a href="popup/beach/beachTeamMemberDetails.xhtml?userId=11">One, A</a>
      <a href="popup/beach/beachTeamMemberDetails.xhtml?userId=22">Two, B</a>`;
  }
  if (url.includes("beachTeamMemberDetails.xhtml?userId=11")) {
    return playerHtml("One, A", 100, 10);
  }
  if (url.includes("beachTeamMemberDetails.xhtml?userId=22")) {
    return playerHtml("Two, B", 80, 8);
  }
  throw new Error(`Unhandled URL: ${url}`);
}

function playerHtml(name: string, lv: number, dvv: number): string {
  return `
    <h2>${name}</h2>
    <table><tbody>
      <tr><td>2026</td><td>DVV-Rangliste Männer</td><td>22.06.2026</td><td>1</td><td>${dvv}</td></tr>
      <tr><td>2026</td><td>BB | Erwachsene Männer</td><td>22.06.2026</td><td>1</td><td>${lv}</td></tr>
    </tbody></table>`;
}
