import { describe, expect, it } from "vitest";
import { estimateAdmissions, presentPublishedAdmissions } from "../lib/estimator";
import type { Player, RegisteredTeam, TournamentMetadata } from "../lib/types";

function player(name: string, lv: number, dvv: number): Player {
  return {
    userId: name,
    name,
    dvvLicense: null,
    lvRanking: { source: "LV", season: 2026, label: "BB | Erwachsene Männer", points: lv, place: null, date: "22.06.2026" },
    dvvRanking: { source: "DVV", season: 2026, label: "DVV-Rangliste Männer", points: dvv, place: null, date: "22.06.2026" },
  };
}

function team(id: string, lv: number, dvv: number, registeredAt = "23.06.2026, 20:12"): RegisteredTeam {
  return {
    id,
    displayName: id,
    club: "",
    registeredAt,
    notes: [],
    players: [
      player(`${id} A`, Math.floor(lv / 2), Math.floor(dvv / 2)),
      player(`${id} B`, Math.ceil(lv / 2), Math.ceil(dvv / 2)),
    ],
  };
}

function partiallyRankedTeam(id: string): RegisteredTeam {
  return {
    ...team(id, 0, 0),
    players: [
      {
        ...player(`${id} A`, 17, 0),
        dvvRanking: null,
      },
      {
        ...player(`${id} B`, 0, 0),
        lvRanking: null,
        dvvRanking: null,
      },
    ],
  };
}

function tournament(category: TournamentMetadata["category"], automaticCapacity: number): TournamentMetadata {
  return {
    id: "1",
    url: "https://www.beachvolleybb.de",
    name: "Cup",
    category,
    categoryLabel: `BB | Kategorie ${category}`,
    gender: "male",
    date: "",
    registrationCount: null,
    mainDrawTeams: automaticCapacity,
    qualificationTeams: 0,
    wildcardMainDraw: 0,
    automaticCapacity,
    admissionDate: "",
  };
}

describe("estimateAdmissions", () => {
  it("uses A tournament DVV/LV quotas", () => {
    const estimate = estimateAdmissions(tournament("A", 4), [
      team("dvv-top", 10, 100),
      team("lv-top", 90, 1),
      team("lv-second", 80, 2),
      team("lv-third", 70, 3),
      team("outside", 1, 1),
    ]);

    expect(estimate.automatic.map((entry) => [entry.id, entry.sourceBucket])).toEqual([
      ["dvv-top", "DVV"],
      ["lv-top", "LV"],
      ["lv-second", "LV"],
      ["lv-third", "LV"],
    ]);
  });

  it("uses category A admission quotas for Landesmeisterschaften", () => {
    const estimate = estimateAdmissions(tournament("LM", 4), [
      team("dvv-top", 10, 100),
      team("lv-top", 90, 1),
      team("lv-second", 80, 2),
      team("lv-third", 70, 3),
      team("outside", 1, 1),
    ]);

    expect(estimate.automatic.map((entry) => [entry.id, entry.sourceBucket])).toEqual([
      ["dvv-top", "DVV"],
      ["lv-top", "LV"],
      ["lv-second", "LV"],
      ["lv-third", "LV"],
    ]);
    expect(estimate.ruleSummary).toContain("Landesmeisterschaft");
  });

  it("uses inverse LV ranking for C tournaments", () => {
    const estimate = estimateAdmissions(tournament("C", 2), [
      team("high", 100, 0),
      team("low", 1, 0),
      team("mid", 50, 0),
    ]);
    expect(estimate.automatic.map((entry) => entry.id)).toEqual(["low", "mid"]);
  });

  it("continues predicted ranks through the waitlist", () => {
    const estimate = estimateAdmissions(tournament("B", 2), [
      team("first", 100, 0),
      team("second", 80, 0),
      team("third", 60, 0),
      team("fourth", 40, 0),
    ]);

    expect(estimate.allTeams.map((entry) => [entry.id, entry.predictedRank])).toEqual([
      ["first", 1],
      ["second", 2],
      ["third", 3],
      ["fourth", 4],
    ]);
  });

  it("separates unresolved teams", () => {
    const unresolved: RegisteredTeam = { ...team("bad", 0, 0), players: [] };
    const estimate = estimateAdmissions(tournament("B", 2), [team("good", 10, 0), unresolved]);
    expect(estimate.unresolved.map((entry) => entry.id)).toEqual(["bad"]);
    expect(estimate.automatic.map((entry) => entry.id)).toEqual(["good"]);
  });

  it("keeps resolved teams rankable when ranking rows are missing", () => {
    const estimate = estimateAdmissions(tournament("B", 2), [partiallyRankedTeam("partial"), team("full", 10, 0)]);

    expect(estimate.unresolved).toEqual([]);
    expect(estimate.automatic.map((entry) => entry.id)).toEqual(["partial", "full"]);
    expect(estimate.automatic[0].notes).toContain("partial A: no matching DVV ranking found.");
    expect(estimate.automatic[0].notes).toContain("partial B: no matching BB ranking found.");
  });

  it("keeps the published order and statuses while using current profile points", () => {
    const published = [
      { ...team("admitted", 220, 12), admission: { rank: 1, status: "Hauptfeld", doubleRegistration: "-", details: "LV Männer: 90" } },
      { ...team("waitlist", 300, 15), admission: { rank: 14, status: "Nachrücker", doubleRegistration: "-", details: "LV Männer: 80 Nachrücker" } },
      { ...team("withdrawn", 400, 20), admission: { rank: null, status: "Absage", doubleRegistration: "-", details: "" } },
    ];

    const result = presentPublishedAdmissions(published);

    expect(result.allTeams.map((entry) => [entry.id, entry.predictedRank, entry.lvPoints, entry.status])).toEqual([
      ["admitted", 1, 220, "automatic"],
      ["waitlist", 14, 300, "waitlist"],
      ["withdrawn", null, 400, "cancelled"],
    ]);
    expect(result.cancelled.map((entry) => entry.id)).toEqual(["withdrawn"]);
  });
});
