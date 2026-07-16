import Link from "next/link";
import { ArrowRight } from "lucide-react";

const versions = [
  { href: "/v1", label: "Klar", description: "Minimal, ruhig und auf eine einzige Aufgabe konzentriert." },
  { href: "/v2", label: "Fokus", description: "Eine freundliche, Google-inspirierte Suchoberfläche." },
  { href: "/v3", label: "Zentrale", description: "Datendichtes Dashboard mit permanenter Werkzeugleiste." },
  { href: "/v4", label: "Geführt", description: "Ein klarer Drei-Schritte-Ablauf für seltene Nutzung." },
  { href: "/v5", label: "Spielfeld", description: "Expressive Court-Optik mit mobiler Werkzeug-Dock." },
] as const;

export default function Home() {
  return (
    <main className="version-index">
      <div className="version-index-inner">
        <header>
          <h1>Sideout · UI-Studien</h1>
          <p>Fünf unterschiedliche Wege zur gleichen Zulassungsschätzung. Wähle eine Version, um sie vollständig zu testen.</p>
        </header>
        <nav className="version-list" aria-label="Designversionen">
          {versions.map((version, index) => (
            <Link className="version-card" href={version.href} key={version.href}>
              <span>0{index + 1}</span>
              <span><strong>{version.label}</strong><small>{version.description}</small></span>
              <ArrowRight aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
