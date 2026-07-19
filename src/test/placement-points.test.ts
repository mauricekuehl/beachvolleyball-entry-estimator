import { describe, expect, it } from "vitest";
import { placementPointsFor } from "../lib/placement-points";

describe("placementPointsFor", () => {
  it("calculates category A points for a 16-team field", () => {
    expect(placementPointsFor("A", 16)).toEqual([
      { placeLabel: "1.", dvvPoints: 8, lvPoints: 102 },
      { placeLabel: "2.", dvvPoints: 6, lvPoints: 82 },
      { placeLabel: "3.", dvvPoints: 4, lvPoints: 68 },
      { placeLabel: "4.", dvvPoints: 3, lvPoints: 54 },
      { placeLabel: "5.–6.", dvvPoints: 2, lvPoints: 27 },
      { placeLabel: "7.–8.", dvvPoints: 1, lvPoints: 20 },
      { placeLabel: "9.–12.", dvvPoints: null, lvPoints: 14 },
      { placeLabel: "13.–16.", dvvPoints: null, lvPoints: 10 },
    ]);
  });

  it("doubles category A LV points for a Landesmeisterschaft", () => {
    const points = placementPointsFor("LM", 32);

    expect(points[0]).toEqual({ placeLabel: "1.", dvvPoints: 8, lvPoints: 276 });
    expect(points.at(-1)).toEqual({ placeLabel: "ab 25.", dvvPoints: null, lvPoints: 5 });
  });

  it("shows no DVV points for categories without DVV scoring", () => {
    expect(placementPointsFor("B", 8).map(({ dvvPoints }) => dvvPoints)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("clips the final placement band to the planned field", () => {
    expect(placementPointsFor("C", 10).at(-1)?.placeLabel).toBe("9.–10.");
  });

  it("returns no points below the minimum field size or for unknown categories", () => {
    expect(placementPointsFor("A", 5)).toEqual([]);
    expect(placementPointsFor("Unknown", 16)).toEqual([]);
  });
});
