import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { growthRequest } from "../../../features/growth/server";
import { GrowthShell, Failure } from "../../../features/growth/shell";
import {
  ExperimentForm,
  ExperimentChoices,
} from "../../../features/growth/feedback";
export const dynamic = "force-dynamic";
export default async function Measurement() {
  try {
    const data = await growthRequest<{
      denominator: string;
      retention: string;
      counts: { type: string; actors: number; events: number }[];
      returns: {
        day: number;
        eligible: number | null;
        returned: number | null;
        rate: number | null;
      }[];
      timeToUsefulAnswerSeconds: number | null;
    }>("funnel");
    return (
      <GrowthShell studio>
        <section className="growth-stack">
          <h1>{growthCopy.growthArrivalAndReturn}</h1>
          <p>{data.denominator}</p>
          <table>
            <caption>{growthCopy.growthLast30DaysFiveActorMinimum}</caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">{growthCopy.growthDistinctActors}</th>
                <th scope="col">Events</th>
              </tr>
            </thead>
            <tbody>
              {data.counts.map((row) => (
                <tr key={row.type}>
                  <th scope="row">{row.type.replaceAll("_", " ")}</th>
                  <td>{row.actors}</td>
                  <td>{row.events}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <caption>{growthCopy.growthClosedArrivalCohorts}</caption>
            <thead>
              <tr>
                <th scope="col">{growthCopy.growthReturnDay}</th>
                <th scope="col">{growthCopy.growthEligibleActors}</th>
                <th scope="col">Returned</th>
                <th scope="col">Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.returns.map((row) => (
                <tr key={row.day}>
                  <th scope="row">D{row.day}</th>
                  <td>{row.eligible ?? "Suppressed"}</td>
                  <td>{row.returned ?? "Suppressed"}</td>
                  <td>
                    {row.rate === null
                      ? growthCopy.growthUnavailable
                      : `${(row.rate * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {growthCopy.growthMedianTimeToFirstUsefulAnswer}{" "}
            {data.timeToUsefulAnswerSeconds === null
              ? "unavailable"
              : growthFormat("growthSeconds", {
                  value1: data.timeToUsefulAnswerSeconds.toFixed(1),
                })}
          </p>
          <p className="growth-help">{data.retention}</p>
          <p className="growth-help">
            {
              growthCopy.growthPilotTargetsAndGrowthExperimentsRequireAgreedSuccessAndStop
            }
          </p>
          <ExperimentForm />
          <ExperimentChoices />
        </section>
      </GrowthShell>
    );
  } catch (error) {
    return (
      <GrowthShell studio>
        <Failure error={error} returnTo="/studio/measurement" />
      </GrowthShell>
    );
  }
}
