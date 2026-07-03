import { getAppBaseUrl, requireEnv } from "./config";
import { formatRawGenderLabel } from "./gender";
import type { PublishedTournament } from "./types";

type SendTournamentEmailInput = {
  email: string;
  unsubscribeToken: string;
  tournament: PublishedTournament;
};

export type EmailSendResult = {
  ok: boolean;
  status: number;
  error?: string;
};

export async function sendNewTournamentEmail({
  email,
  unsubscribeToken,
  tournament,
}: SendTournamentEmailInput): Promise<EmailSendResult> {
  const unsubscribeUrl = `${getAppBaseUrl()}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const genderLabel = formatRawGenderLabel(tournament.gender);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`,
    },
    body: JSON.stringify({
      from: formatSender(),
      to: [email],
      subject: `New ${genderLabel} ${tournament.categoryLabel || tournament.category} tournament published`,
      html: buildHtmlContent(tournament, unsubscribeUrl),
      text: buildTextContent(tournament, unsubscribeUrl),
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (response.ok) {
    return { ok: true, status: response.status };
  }

  return {
    ok: false,
    status: response.status,
    error: await response.text().catch(() => "Resend request failed."),
  };
}

function formatSender(): string {
  const fromEmail = requireEnv("RESEND_FROM_EMAIL");
  const fromName = process.env.RESEND_FROM_NAME?.trim() || "Beachvolleyball Entry Estimator";
  return `${fromName} <${fromEmail}>`;
}

function buildHtmlContent(tournament: PublishedTournament, unsubscribeUrl: string): string {
  const genderLabel = formatRawGenderLabel(tournament.gender);

  return `
    <p>A new BeachvolleyBB tournament was published:</p>
    <p>
      <strong>${escapeHtml(tournament.name)}</strong><br>
      ${escapeHtml(tournament.categoryLabel || tournament.category)}<br>
      Gender: ${escapeHtml(genderLabel)}<br>
      ${escapeHtml(tournament.date || "Date not listed")}<br>
      ${escapeHtml(tournament.location || "Location not listed")}
    </p>
    <p><a href="${escapeHtml(tournament.url)}">Open tournament</a></p>
    <p style="font-size:12px;color:#666">
      <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a>
    </p>
  `;
}

function buildTextContent(tournament: PublishedTournament, unsubscribeUrl: string): string {
  const genderLabel = formatRawGenderLabel(tournament.gender);

  return [
    "A new BeachvolleyBB tournament was published:",
    "",
    tournament.name,
    tournament.categoryLabel || tournament.category,
    `Gender: ${genderLabel}`,
    tournament.date || "Date not listed",
    tournament.location || "Location not listed",
    "",
    tournament.url,
    "",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
