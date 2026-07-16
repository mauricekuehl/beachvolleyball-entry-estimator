import Link from "next/link";

const concepts = [
  { href: "/v1", number: "01", name: "Court Plan", note: "Clear & structured" },
  { href: "/v2", number: "02", name: "Sunset Ticket", note: "Warm & welcoming" },
  { href: "/v3", number: "03", name: "Live Board", note: "Fast & data-led" },
  { href: "/v4", number: "04", name: "Coastal Calm", note: "Quiet & guided" },
  { href: "/v5", number: "05", name: "Federation Desk", note: "Official & compact" },
] as const;

export default function Home() {
  return (
    <main className="concept-index" id="main-content">
      <div className="concept-index__heading">
        <span>Beach Entry / Design Study</span>
        <h1>Choose A Direction</h1>
      </div>
      <nav className="concept-list" aria-label="Design concepts">
        {concepts.map((concept) => (
          <Link className="concept-link" href={concept.href} key={concept.href}>
            <span className="concept-link__number" aria-hidden="true">
              {concept.number}
            </span>
            <span className="concept-link__name">{concept.name}</span>
            <span className="concept-link__note">{concept.note}</span>
            <span className="concept-link__arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
