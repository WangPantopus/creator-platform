import { StudioCallOffer } from "../../../../../../features/calls/StudioCallOffer";
export default async function OfferPage({
  params,
}: {
  params: Promise<{ creatorId: string; fanId: string; commitmentId: string }>;
}) {
  // Current authorization/acceptance comes from W4; URLs cannot carry a signed-act or authorization claim.
  const destination = await params;
  return (
    <StudioCallOffer
      key={`${destination.creatorId}/${destination.fanId}/${destination.commitmentId}`}
      {...destination}
    />
  );
}
