import type {
  EstimatedTeam,
  RankingSource,
  RegisteredTeam,
  TournamentCategory,
  TournamentMetadata,
} from "./types";
import { EstimateError } from "./types";

type Rule = {
  summary: string;
  dvvShare: number;
  inverseLv: boolean;
};

export function estimateAdmissions(tournament: TournamentMetadata, teams: RegisteredTeam[]) {
  const rule = ruleForCategory(tournament.category);
  if (!rule) {
    throw new EstimateError("Nicht unterstützte oder unbekannte Turnierkategorie.", 422, "UNSUPPORTED_CATEGORY");
  }

  const rankedTeams = teams.map(toEstimatedTeam);
  const unresolved = rankedTeams.filter((team) => team.status === "unresolved");
  const eligible = rankedTeams.filter((team) => team.status !== "unresolved");
  const automaticCapacity = tournament.automaticCapacity;
  let automatic: EstimatedTeam[] = [];

  if (rule.inverseLv) {
    automatic = eligible
      .toSorted(compareBy("LV", true))
      .slice(0, automaticCapacity)
      .map((team, index) => markAutomatic(team, index + 1, "INVERSE_LV"));
  } else if (rule.dvvShare === 0) {
    automatic = eligible
      .toSorted(compareBy("LV", false))
      .slice(0, automaticCapacity)
      .map((team, index) => markAutomatic(team, index + 1, "LV"));
  } else {
    const dvvQuota = Math.floor(automaticCapacity * rule.dvvShare);
    const chosen = new Map<string, EstimatedTeam>();

    for (const team of eligible.toSorted(compareBy("DVV", false)).slice(0, dvvQuota)) {
      chosen.set(team.id, { ...team, sourceBucket: "DVV" });
    }

    for (const team of eligible.toSorted(compareBy("LV", false))) {
      if (chosen.size >= automaticCapacity) break;
      if (!chosen.has(team.id)) {
        chosen.set(team.id, { ...team, sourceBucket: "LV" });
      }
    }

    automatic = [...chosen.values()]
      .toSorted((a, b) => {
        const sourceDiff = sourcePriority(a.sourceBucket) - sourcePriority(b.sourceBucket);
        if (sourceDiff !== 0) return sourceDiff;
        return compareBy(a.sourceBucket === "DVV" ? "DVV" : "LV", false)(a, b);
      })
      .slice(0, automaticCapacity)
      .map((team, index) => markAutomatic(team, index + 1, team.sourceBucket));
  }

  const automaticIds = new Set(automatic.map((team) => team.id));
  const waitlist = eligible
    .filter((team) => !automaticIds.has(team.id))
    .toSorted(rule.inverseLv ? compareBy("LV", true) : compareBy("LV", false))
    .map((team, index) => ({ ...team, status: "waitlist" as const, predictedRank: automatic.length + index + 1 }));

  return {
    ruleSummary: rule.summary,
    automatic,
    waitlist,
    unresolved,
    allTeams: [...automatic, ...waitlist, ...unresolved],
  };
}

export function ruleForCategory(category: TournamentCategory): Rule | null {
  switch (category) {
    case "Premium":
    case "A+":
      return {
        summary: "Premium- und A+-Turniere: 50 % DVV-Rangliste und 50 % LV-Rangliste.",
        dvvShare: 0.5,
        inverseLv: false,
      };
    case "A":
      return {
        summary: "A-Turniere: 25 % DVV-Rangliste und 75 % LV-Rangliste.",
        dvvShare: 0.25,
        inverseLv: false,
      };
    case "B":
      return {
        summary: "B-Turniere: 100 % LV-Rangliste.",
        dvvShare: 0,
        inverseLv: false,
      };
    case "C":
      return {
        summary: "C-Turniere: inverse LV-Wertung, daher werden niedrigere LV-Punkte bevorzugt.",
        dvvShare: 0,
        inverseLv: true,
      };
    default:
      return null;
  }
}

function toEstimatedTeam(team: RegisteredTeam): EstimatedTeam {
  const lvPoints = sumPoints(team, "LV");
  const dvvPoints = sumPoints(team, "DVV");
  const notes = [...team.notes];

  if (team.players.length !== 2) {
    notes.push("Team does not have exactly two resolved public player profiles.");
  }
  for (const player of team.players) {
    if (!player.lvRanking) notes.push(`${player.name}: no matching BB ranking found.`);
    if (!player.dvvRanking) notes.push(`${player.name}: no matching DVV ranking found.`);
  }

  const unresolved = team.players.length !== 2;

  return {
    ...team,
    notes,
    status: unresolved ? "unresolved" : "waitlist",
    predictedRank: null,
    sourceBucket: unresolved ? "UNRESOLVED" : "LV",
    lvPoints,
    dvvPoints,
  };
}

function sumPoints(team: RegisteredTeam, source: RankingSource): number {
  return team.players.reduce((total, player) => {
    const ranking = source === "LV" ? player.lvRanking : player.dvvRanking;
    return total + (ranking?.points ?? 0);
  }, 0);
}

function compareBy(source: RankingSource, ascending: boolean) {
  return (a: EstimatedTeam, b: EstimatedTeam) => {
    const aPoints = source === "LV" ? a.lvPoints : a.dvvPoints;
    const bPoints = source === "LV" ? b.lvPoints : b.dvvPoints;
    const scoreDiff = ascending ? aPoints - bPoints : bPoints - aPoints;
    if (scoreDiff !== 0) return scoreDiff;

    const dateDiff = parseRegistrationTime(a.registeredAt) - parseRegistrationTime(b.registeredAt);
    if (dateDiff !== 0) return dateDiff;
    return a.id.localeCompare(b.id);
  };
}

function markAutomatic(
  team: EstimatedTeam,
  predictedRank: number,
  sourceBucket: EstimatedTeam["sourceBucket"],
): EstimatedTeam {
  return {
    ...team,
    status: "automatic",
    predictedRank,
    sourceBucket,
  };
}

function sourcePriority(source: EstimatedTeam["sourceBucket"]): number {
  if (source === "DVV") return 0;
  if (source === "LV") return 1;
  return 2;
}

function parseRegistrationTime(value: string): number {
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4}),?\s*(\d{2})?:?(\d{2})?/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const [, day, month, year, hour = "0", minute = "0"] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}
