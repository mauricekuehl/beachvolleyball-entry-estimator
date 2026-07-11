import { EstimatorClient } from "../estimator-client";

export default async function TournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const initialTournamentId = rawId && /^\d+$/.test(rawId) ? rawId : undefined;

  return <EstimatorClient initialTournamentId={initialTournamentId} />;
}
