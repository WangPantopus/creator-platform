import Link from "next/link";
import { componentList } from "../../../lib/design";
export default function Page() {
  return (
    <main className="design-index">
      <h1>Component catalog</h1>
      <p>
        Every composition comes from its checked-in preview. Choose Light or
        Night with your system appearance, or the theme query parameter.
      </p>
      <ul className="design-grid">
        {componentList().map((name) => (
          <li key={name}>
            <Link href={`/design/components/${name}`}>{name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
