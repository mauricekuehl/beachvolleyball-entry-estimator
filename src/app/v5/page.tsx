import { VersionPage } from "../version-page";

export default function Page({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  return <VersionPage variant="v5" searchParams={searchParams} />;
}
