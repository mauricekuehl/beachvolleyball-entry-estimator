import { EstimatorClient, type DesignVariant } from "./estimator-client";

export async function VersionPage({
  variant,
  searchParams,
}: {
  variant: DesignVariant;
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const initialTournamentId = rawId && /^\d+$/.test(rawId) ? rawId : undefined;

  return <EstimatorClient variant={variant} initialTournamentId={initialTournamentId} />;
}
