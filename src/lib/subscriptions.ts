import { randomUUID } from "node:crypto";
import { getDb } from "./database";
import type { SubscriptionCategory, SubscriptionGender, TournamentGender } from "./types";

export const SUBSCRIPTION_CATEGORIES = ["Premium", "A+", "A", "B", "C"] as const satisfies readonly SubscriptionCategory[];
export const SUBSCRIPTION_GENDERS = ["male", "female", "mixed"] as const satisfies readonly SubscriptionGender[];
type StoredSubscriptionGender = SubscriptionGender | "any";

export type SubscriptionRecord = {
  email: string;
  categories: SubscriptionCategory[];
  gender: StoredSubscriptionGender;
  unsubscribeToken: string;
};

export class SubscriptionInputError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

export function parseSubscriptionInput(input: unknown): {
  email: string;
  categories: SubscriptionCategory[];
  gender: SubscriptionGender;
} {
  if (!input || typeof input !== "object") {
    throw new SubscriptionInputError("Request body must be an object.", "INVALID_BODY");
  }

  const body = input as { email?: unknown; categories?: unknown; gender?: unknown };
  if (typeof body.email !== "string" || !isValidEmail(body.email)) {
    throw new SubscriptionInputError("Enter a valid email address.", "INVALID_EMAIL");
  }

  if (!Array.isArray(body.categories)) {
    throw new SubscriptionInputError("Choose at least one category.", "INVALID_CATEGORIES");
  }

  const categories = [...new Set(body.categories)].filter(isSubscriptionCategory);
  if (categories.length === 0) {
    throw new SubscriptionInputError("Choose at least one category.", "INVALID_CATEGORIES");
  }

  if (!isSubscriptionGender(body.gender)) {
    throw new SubscriptionInputError("Choose one gender.", "INVALID_GENDER");
  }

  return {
    email: body.email.trim().toLowerCase(),
    categories,
    gender: body.gender,
  };
}

export async function upsertSubscription(
  email: string,
  categories: SubscriptionCategory[],
  gender: SubscriptionGender,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO subscriptions (
        id,
        email,
        categories,
        gender,
        unsubscribe_token,
        active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        categories = excluded.categories,
        gender = excluded.gender,
        active = 1,
        updated_at = excluded.updated_at,
        unsubscribed_at = NULL`,
    args: [randomUUID(), email, JSON.stringify(categories), gender, randomUUID(), now, now],
  });
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!token.trim()) return false;

  const db = await getDb();
  const result = await db.execute({
    sql: `UPDATE subscriptions
      SET active = 0,
        updated_at = ?,
        unsubscribed_at = ?
      WHERE unsubscribe_token = ?`,
    args: [new Date().toISOString(), new Date().toISOString(), token],
  });

  return result.rowsAffected > 0;
}

export async function listActiveSubscriptionsForTournament(
  category: SubscriptionCategory,
  gender: TournamentGender,
): Promise<SubscriptionRecord[]> {
  const db = await getDb();
  const result = await db.execute(
    "SELECT email, categories, gender, unsubscribe_token FROM subscriptions WHERE active = 1",
  );

  return result.rows
    .map((row) => ({
      email: String(row.email ?? ""),
      categories: parseStoredCategories(String(row.categories ?? "[]")),
      gender: parseStoredGender(row.gender),
      unsubscribeToken: String(row.unsubscribe_token ?? ""),
    }))
    .filter((subscription) => subscription.email && subscription.unsubscribeToken)
    .filter((subscription) => subscription.categories.includes(category))
    .filter((subscription) => subscription.gender === "any" || subscription.gender === gender);
}

function parseStoredCategories(value: string): SubscriptionCategory[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSubscriptionCategory);
  } catch {
    return [];
  }
}

function isSubscriptionCategory(value: unknown): value is SubscriptionCategory {
  return SUBSCRIPTION_CATEGORIES.includes(value as SubscriptionCategory);
}

function isSubscriptionGender(value: unknown): value is SubscriptionGender {
  return SUBSCRIPTION_GENDERS.includes(value as SubscriptionGender);
}

function parseStoredGender(value: unknown): StoredSubscriptionGender {
  if (isSubscriptionGender(value)) return value;
  return "any";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
