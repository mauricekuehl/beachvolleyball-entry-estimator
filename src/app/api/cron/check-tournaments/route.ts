import { ConfigurationError, requireEnv } from "@/lib/config";
import { checkForNewTournamentPublications } from "@/lib/tournament-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runProtectedCron(request);
}

export async function POST(request: Request) {
  return runProtectedCron(request);
}

async function runProtectedCron(request: Request) {
  try {
    const expectedSecret = requireEnv("CRON_SECRET");
    const authHeader = request.headers.get("authorization") ?? "";
    const headerSecret = request.headers.get("x-cron-secret") ?? "";
    const authorized =
      authHeader === `Bearer ${expectedSecret}` || (headerSecret.length > 0 && headerSecret === expectedSecret);

    if (!authorized) {
      return Response.json({ error: "Unauthorized.", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const result = await checkForNewTournamentPublications();
    return Response.json(result);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return Response.json({ error: error.message, code: error.code }, { status: 500 });
    }

    console.error(error);
    return Response.json(
      { error: "Die Turnierbenachrichtigungsprüfung ist fehlgeschlagen.", code: "TOURNAMENT_CHECK_FAILED" },
      { status: 500 },
    );
  }
}
