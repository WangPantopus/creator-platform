import Link from "next/link";
export default function Page() {
  return (
    <main className="design-index">
      <h1>Design reference</h1>
      <p>
        The original compositions, with the approved build corrections. These
        catalogs contain sample content and show design states.
      </p>
      <ul className="design-grid">
        <li>
          <Link href="/design/components">53 components</Link>
        </li>
        <li>
          <Link href="/design/screens">64 screens and prototypes</Link>
        </li>
      </ul>
    </main>
  );
}
