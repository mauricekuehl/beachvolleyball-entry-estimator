import type { TournamentGender } from "./types";

export function parseGenderLabel(label: string): TournamentGender {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, " ");

  if (!normalized) return "unknown";
  if (normalized.includes("mixed")) return "mixed";
  if (normalized === "m" || normalized.includes("(m)") || /\b(maennlich|männlich|men|male|männer)\b/.test(normalized)) {
    return "male";
  }
  if (normalized === "w" || normalized.includes("(w)") || /\b(weiblich|women|female|frauen)\b/.test(normalized)) {
    return "female";
  }

  return "unknown";
}

export function formatGenderLabel(gender: TournamentGender): string {
  if (gender === "male") return "Männer";
  if (gender === "female") return "Frauen";
  if (gender === "mixed") return "Mixed";
  return "Unbekannt";
}

export function formatRawGenderLabel(label: string): string {
  const gender = parseGenderLabel(label);
  if (gender !== "unknown") return formatGenderLabel(gender);

  const trimmed = label.trim();
  return trimmed || formatGenderLabel(gender);
}
