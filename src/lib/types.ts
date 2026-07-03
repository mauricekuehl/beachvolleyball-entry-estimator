export type TournamentCategory = "Premium" | "A+" | "A" | "B" | "C" | "Unknown";
export type SubscriptionCategory = Exclude<TournamentCategory, "Unknown">;
export type TournamentGender = "male" | "female" | "mixed" | "unknown";
export type SubscriptionGender = Exclude<TournamentGender, "unknown">;
export type RankingSource = "DVV" | "LV";
export type TeamStatus = "automatic" | "waitlist" | "unresolved";

export type TournamentMetadata = {
  id: string;
  url: string;
  name: string;
  category: TournamentCategory;
  categoryLabel: string;
  gender: TournamentGender;
  date: string;
  registrationCount: number | null;
  mainDrawTeams: number;
  qualificationTeams: number;
  wildcardMainDraw: number;
  automaticCapacity: number;
  admissionDate: string;
};

export type PlayerRanking = {
  source: RankingSource;
  season: number;
  label: string;
  points: number;
  place: number | null;
  date: string;
};

export type Player = {
  userId: string;
  name: string;
  dvvLicense: string | null;
  lvRanking: PlayerRanking | null;
  dvvRanking: PlayerRanking | null;
};

export type RegisteredTeam = {
  id: string;
  displayName: string;
  club: string;
  registeredAt: string;
  players: Player[];
  notes: string[];
};

export type EstimatedTeam = RegisteredTeam & {
  status: TeamStatus;
  predictedRank: number | null;
  sourceBucket: RankingSource | "INVERSE_LV" | "UNRESOLVED";
  lvPoints: number;
  dvvPoints: number;
};

export type EstimateResponse = {
  tournament: TournamentMetadata;
  ruleSummary: string;
  automatic: EstimatedTeam[];
  waitlist: EstimatedTeam[];
  unresolved: EstimatedTeam[];
  allTeams: EstimatedTeam[];
  dataSources: {
    fetchedAt: string;
    registrationsUrl: string;
    admissionsUrl: string;
  };
};

export type PublishedTournament = {
  id: string;
  name: string;
  category: TournamentCategory;
  categoryLabel: string;
  url: string;
  date: string;
  location: string;
  gender: string;
  teams: string;
  registrationState: string;
};

export class EstimateError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}
