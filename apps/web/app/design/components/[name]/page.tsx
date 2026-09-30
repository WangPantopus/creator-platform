import { notFound } from "next/navigation";
import { componentList, renderComponent } from "../../../../lib/design";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ raw?: string }>;
}) {
  const { name } = await params;
  const { raw } = await searchParams;
  if (!componentList().includes(name)) notFound();
  return (
    <main>
      {!raw && (
        <div className="preview-notice">
          <a href="/design/components">Components</a>
          {name} · design preview
        </div>
      )}
      {renderComponent(name)}
    </main>
  );
}
