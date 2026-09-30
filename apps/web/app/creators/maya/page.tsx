import CreatorHome, {
  generateMetadata as creatorMetadata,
} from "../[handle]/page";
export const dynamic = "force-dynamic";
export function generateMetadata() {
  return creatorMetadata({ params: Promise.resolve({ handle: "maya" }) });
}
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  return (
    <CreatorHome
      params={Promise.resolve({ handle: "maya" })}
      searchParams={searchParams}
    />
  );
}
