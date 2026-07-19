import type { TournamentCategory } from "./types";

export type PlacementPoints = {
  placeLabel: string;
  lvPoints: number;
  dvvPoints: number | null;
};

type PlacementBand = {
  from: number;
  to: number | null;
  lvBasePoints: number;
  dvvPoints: Partial<Record<TournamentCategory, number>>;
};

const LV_CATEGORY_FACTORS: Partial<Record<TournamentCategory, number>> = {
  Premium: 12,
  "A+": 8,
  A: 4,
  B: 2,
  C: 1,
  LM: 8,
};

const PLACEMENT_BANDS: readonly PlacementBand[] = [
  { from: 1, to: 1, lvBasePoints: 15, dvvPoints: { Premium: 50, "A+": 25, A: 8, LM: 8 } },
  { from: 2, to: 2, lvBasePoints: 12, dvvPoints: { Premium: 40, "A+": 20, A: 6, LM: 6 } },
  { from: 3, to: 3, lvBasePoints: 10, dvvPoints: { Premium: 32, "A+": 16, A: 4, LM: 4 } },
  { from: 4, to: 4, lvBasePoints: 8, dvvPoints: { Premium: 24, "A+": 12, A: 3, LM: 3 } },
  { from: 5, to: 6, lvBasePoints: 4, dvvPoints: { Premium: 16, "A+": 8, A: 2, LM: 2 } },
  { from: 7, to: 8, lvBasePoints: 3, dvvPoints: { Premium: 10, "A+": 5, A: 1, LM: 1 } },
  { from: 9, to: 12, lvBasePoints: 2, dvvPoints: { Premium: 8, "A+": 3 } },
  { from: 13, to: 16, lvBasePoints: 1.5, dvvPoints: { Premium: 4, "A+": 2 } },
  { from: 17, to: 20, lvBasePoints: 1, dvvPoints: { Premium: 2 } },
  { from: 21, to: 24, lvBasePoints: 0.5, dvvPoints: { Premium: 2 } },
  { from: 25, to: null, lvBasePoints: 0.25, dvvPoints: {} },
];

export function placementPointsFor(category: TournamentCategory, teamCount: number): PlacementPoints[] {
  const categoryFactor = LV_CATEGORY_FACTORS[category];
  const teamFactor = teamFactorFor(teamCount);
  if (!categoryFactor || !teamFactor) return [];

  return PLACEMENT_BANDS.filter((band) => band.from <= teamCount).map((band) => ({
    placeLabel: formatPlaceBand(band, teamCount),
    lvPoints: Math.round(categoryFactor * band.lvBasePoints * teamFactor),
    dvvPoints: band.dvvPoints[category] ?? null,
  }));
}

function teamFactorFor(teamCount: number): number | null {
  if (teamCount < 6) return null;
  if (teamCount >= 25) return 2.3;
  if (teamCount >= 17) return 2;
  if (teamCount >= 13) return 1.7;
  if (teamCount >= 9) return 1.3;
  if (teamCount >= 7) return 1;
  return 0.7;
}

function formatPlaceBand(band: PlacementBand, teamCount: number): string {
  if (band.to == null) return `ab ${band.from}.`;
  const lastPlace = Math.min(band.to, teamCount);
  return band.from === lastPlace ? `${band.from}.` : `${band.from}.–${lastPlace}.`;
}
