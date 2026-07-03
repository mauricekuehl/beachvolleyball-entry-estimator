import { ConfigurationError } from "@/lib/config";
import { parseSubscriptionInput, SubscriptionInputError, upsertSubscription } from "@/lib/subscriptions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = parseSubscriptionInput(await request.json());
    await upsertSubscription(input.email, input.categories, input.gender);

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SubscriptionInputError) {
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    }

    if (error instanceof ConfigurationError) {
      return Response.json({ error: error.message, code: error.code }, { status: 500 });
    }

    console.error(error);
    return Response.json(
      { error: "Could not save the subscription.", code: "SUBSCRIPTION_FAILED" },
      { status: 500 },
    );
  }
}
