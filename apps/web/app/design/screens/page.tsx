import Link from "next/link";
import { screenList } from "../../../lib/design";
export default function Page() {
  return (
    <main className="design-index">
      <h1>Screen catalog</h1>
      <p>
        Sample design states. Purchases, creator signatures, messages and calls
        are unavailable here.
      </p>
      <ul className="design-grid">
        {screenList().map((screen) => (
          <li key={`${screen.group}/${screen.id}`}>
            <span className="qv-meta">{screen.group}</span>
            <Link href={`/design/screens/${screen.group}/${screen.id}`}>
              {screen.title}
            </Link>
            <span className="qv-help">
              {screen.width} × {screen.height}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
