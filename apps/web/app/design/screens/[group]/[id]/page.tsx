import { notFound } from "next/navigation";
import { getScreen, renderScreen } from "../../../../../lib/design";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ group: string; id: string }>;
  searchParams: Promise<{ raw?: string; step?: string }>;
}) {
  const { group, id } = await params;
  const { raw, step } = await searchParams;
  const screen = getScreen(group, id);
  if (!screen) notFound();
  const position = Math.max(0, Math.min(5, Number(step) || 0));
  return (
    <main>
      {!raw && (
        <div className="preview-notice">
          <a href="/design/screens">Screens</a>
          {screen.title} · design preview{" "}
          {group === "phase5-prototypes" && (
            <a href={`?step=${(position + 1) % (id === "StepIn" ? 5 : 4)}`}>
              Next prototype state
            </a>
          )}
        </div>
      )}
      <div className="preview-board">
        {renderScreen(screen, {
          values: { s: position, i: position, score: 0 },
        })}
      </div>
    </main>
  );
}
