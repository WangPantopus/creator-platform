import "./trust.css";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="trust-skip" href="#ops-main">
        Skip to case content
      </a>
      {children}
    </>
  );
}
