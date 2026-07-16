import { estimateAdmissions, presentPublishedAdmissions } from "@/lib/estimator";
import { buildTournamentUrl, scrapeBeachvolleyBb } from "@/lib/scraper";
import { EstimateError } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tournamentUrl?: unknown };
    if (typeof body.tournamentUrl !== "string") {
      throw new EstimateError("Die Turnier-URL fehlt oder ist ungültig.", 400, "INVALID_BODY");
    }

    const { tournament, teams, admissionsPublished } = await scrapeBeachvolleyBb(body.tournamentUrl);
    const estimate = admissionsPublished ? presentPublishedAdmissions(teams) : estimateAdmissions(tournament, teams);

    return Response.json({
      tournament,
      admissionsPublished,
      ...estimate,
      dataSources: {
        fetchedAt: new Date().toISOString(),
        registrationsUrl: buildTournamentUrl(tournament.id, "registrations"),
        admissionsUrl: buildTournamentUrl(tournament.id, "admissions"),
      },
    });
  } catch (error) {
    if (error instanceof EstimateError) {
      return Response.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      );
    }

    console.error(error);
    return Response.json(
      {
        error: "Die Schätzung ist beim Abrufen oder Auslesen der öffentlichen Turnierdaten fehlgeschlagen.",
        code: "ESTIMATE_FAILED",
      },
      { status: 500 },
    );
  }
}
