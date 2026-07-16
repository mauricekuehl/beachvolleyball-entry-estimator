import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EstimatorClient, type DesignVersion } from "../estimator-client";

const VERSIONS = ["v1", "v2", "v3", "v4", "v5"] as const satisfies readonly DesignVersion[];

const TITLES: Record<DesignVersion, string> = {
  v1: "Court Plan",
  v2: "Sunset Ticket",
  v3: "Live Board",
  v4: "Coastal Calm",
  v5: "Federation Desk",
};

export function generateStaticParams() {
  return VERSIONS.map((version) => ({ version }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ version: string }>;
}): Promise<Metadata> {
  const { version } = await params;
  if (!VERSIONS.includes(version as DesignVersion)) return {};

  return {
    title: `${TITLES[version as DesignVersion]} | Beach Entry`,
  };
}

export default async function VersionPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;

  if (!VERSIONS.includes(version as DesignVersion)) notFound();

  return <EstimatorClient version={version as DesignVersion} />;
}
