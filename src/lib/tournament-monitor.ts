import { randomUUID } from "node:crypto";
import { getDb } from "./database";
import { sendNewTournamentEmail } from "./email";
import { parseGenderLabel } from "./gender";
import { scrapePublishedTournaments } from "./scraper";
import { listActiveSubscriptionsForTournament } from "./subscriptions";
import type { PublishedTournament, SubscriptionCategory, TournamentCategory } from "./types";

type NotificationError = {
  tournamentId: string;
  email?: string;
  error: string;
};

export type TournamentMonitorResult = {
  discovered: number;
  seeded: boolean;
  storedAsSeen: number;
  newTournaments: PublishedTournament[];
  emailsAttempted: number;
  emailsSent: number;
  errors: NotificationError[];
};

export async function checkForNewTournamentPublications(): Promise<TournamentMonitorResult> {
  const tournaments = await scrapePublishedTournaments();
  const seenCount = await getSeenTournamentCount();

  if (seenCount === 0) {
    await Promise.all(tournaments.map((tournament) => insertSeenTournament(tournament)));
    return {
      discovered: tournaments.length,
      seeded: true,
      storedAsSeen: tournaments.length,
      newTournaments: [],
      emailsAttempted: 0,
      emailsSent: 0,
      errors: [],
    };
  }

  const seenIds = await getSeenTournamentIds(tournaments.map((tournament) => tournament.id));
  const newTournaments = tournaments.filter((tournament) => !seenIds.has(tournament.id));
  let emailsAttempted = 0;
  let emailsSent = 0;
  const errors: NotificationError[] = [];

  for (const tournament of newTournaments) {
    await insertSeenTournament(tournament);

    if (!isSubscriptionCategory(tournament.category)) {
      continue;
    }

    const subscriptions = await listActiveSubscriptionsForTournament(
      tournament.category,
      parseGenderLabel(tournament.gender),
    );
    for (const subscription of subscriptions) {
      emailsAttempted += 1;
      try {
        const result = await sendNewTournamentEmail({
          email: subscription.email,
          unsubscribeToken: subscription.unsubscribeToken,
          tournament,
        });

        if (result.ok) {
          emailsSent += 1;
          await logNotification(tournament.id, subscription.email, "sent");
        } else {
          const error = result.error || `Resend returned ${result.status}.`;
          errors.push({ tournamentId: tournament.id, email: subscription.email, error });
          await logNotification(tournament.id, subscription.email, "failed", error);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Email send failed.";
        errors.push({ tournamentId: tournament.id, email: subscription.email, error: message });
        await logNotification(tournament.id, subscription.email, "failed", message);
      }
    }
  }

  return {
    discovered: tournaments.length,
    seeded: false,
    storedAsSeen: newTournaments.length,
    newTournaments,
    emailsAttempted,
    emailsSent,
    errors,
  };
}

async function getSeenTournamentCount(): Promise<number> {
  const db = await getDb();
  const result = await db.execute("SELECT COUNT(*) AS count FROM seen_tournaments");
  return Number(result.rows[0]?.count ?? 0);
}

async function getSeenTournamentIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const db = await getDb();
  const placeholders = ids.map(() => "?").join(", ");
  const result = await db.execute({
    sql: `SELECT tournament_id FROM seen_tournaments WHERE tournament_id IN (${placeholders})`,
    args: ids,
  });

  return new Set(result.rows.map((row) => String(row.tournament_id)));
}

async function insertSeenTournament(tournament: PublishedTournament): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT OR IGNORE INTO seen_tournaments (
        tournament_id,
        category,
        name,
        url,
        first_seen_at
      ) VALUES (?, ?, ?, ?, ?)`,
    args: [tournament.id, tournament.category, tournament.name, tournament.url, new Date().toISOString()],
  });
}

async function logNotification(
  tournamentId: string,
  email: string,
  status: "sent" | "failed",
  error?: string,
): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO notification_log (
        id,
        tournament_id,
        email,
        sent_at,
        status,
        error
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [randomUUID(), tournamentId, email, new Date().toISOString(), status, error?.slice(0, 2000) ?? null],
  });
}

function isSubscriptionCategory(category: TournamentCategory): category is SubscriptionCategory {
  return category !== "Unknown" && category !== "LM";
}
