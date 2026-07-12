import { ConfigurationError } from "@/lib/config";
import { unsubscribeByToken } from "@/lib/subscriptions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const unsubscribed = await unsubscribeByToken(token);
    const title = unsubscribed ? "Abgemeldet" : "Abo nicht gefunden";
    const message = unsubscribed
      ? "Du erhältst keine neuen BeachvolleyBB-Turnier-E-Mails mehr."
      : "Dieser Abmeldelink ist ungültig oder wurde bereits verwendet.";

    return new Response(
      `<!doctype html>
        <html lang="de">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>${title}</title>
          </head>
          <body style="font-family: Arial, sans-serif; padding: 32px; line-height: 1.45">
            <h1>${title}</h1>
            <p>${message}</p>
          </body>
        </html>`,
      {
        status: unsubscribed ? 200 : 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return Response.json({ error: error.message, code: error.code }, { status: 500 });
    }

    console.error(error);
    return Response.json({ error: "Die Abmeldung ist fehlgeschlagen.", code: "UNSUBSCRIBE_FAILED" }, { status: 500 });
  }
}
