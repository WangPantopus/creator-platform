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
          <h1>Arrival and return</h1>
          <p>{data.denominator}</p>
          <table>
            <caption>Last 30 days · five-actor minimum</caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Distinct actors</th>
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
            <caption>Closed arrival cohorts</caption>
            <thead>
              <tr>
                <th scope="col">Return day</th>
                <th scope="col">Eligible actors</th>
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
                      ? "Unavailable"
                      : `${(row.rate * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Median time to first useful answer:{" "}
            {data.timeToUsefulAnswerSeconds === null
              ? "unavailable"
              : `${data.timeToUsefulAnswerSeconds.toFixed(1)} seconds`}
          </p>
          <p className="growth-help">{data.retention}</p>
          <p className="growth-help">
            Pilot targets and growth experiments require agreed success and stop
            criteria. No uplift is claimed.
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
