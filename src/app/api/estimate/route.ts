import { estimateAdmissions } from "@/lib/estimator";
import { scrapeBeachvolleyBb } from "@/lib/scraper";
import { EstimateError } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tournamentUrl?: unknown };
    if (typeof body.tournamentUrl !== "string") {
      throw new EstimateError("tournamentUrl must be a string.", 400, "INVALID_BODY");
    }

    const { tournament, teams } = await scrapeBeachvolleyBb(body.tournamentUrl);
    const estimate = estimateAdmissions(tournament, teams);

    return Response.json({
      tournament,
      ...estimate,
      dataSources: {
        fetchedAt: new Date().toISOString(),
        registrationsUrl: body.tournamentUrl,
        admissionsUrl: body.tournamentUrl.replace("registrations", "admissions"),
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
        error: "The estimate failed while fetching or parsing public tournament data.",
        code: "ESTIMATE_FAILED",
      },
      { status: 500 },
    );
  }
}
