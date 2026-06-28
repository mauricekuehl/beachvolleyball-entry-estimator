import { ConfigurationError } from "@/lib/config";
import { unsubscribeByToken } from "@/lib/subscriptions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const unsubscribed = await unsubscribeByToken(token);
    const title = unsubscribed ? "Unsubscribed" : "Subscription not found";
    const message = unsubscribed
      ? "You will no longer receive new BeachvolleyBB tournament emails."
      : "This unsubscribe link is invalid or has already been used.";

    return new Response(
      `<!doctype html>
        <html lang="en">
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
    return Response.json({ error: "Could not unsubscribe.", code: "UNSUBSCRIBE_FAILED" }, { status: 500 });
  }
}
