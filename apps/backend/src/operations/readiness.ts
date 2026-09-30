export type Capability = {
  state: "available" | "unavailable" | "development";
  code: string;
  checkedAt: string;
};
export type Probe = {
  name: string;
  required: boolean;
  run: () => Promise<Omit<Capability, "checkedAt">>;
};
export class Readiness {
  constructor(
    readonly probes: Probe[],
    readonly environment: string,
    readonly release: string,
  ) {}
  async inspect() {
    const results = await Promise.all(
      this.probes.map(async (probe) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const value = await Promise.race([
            probe.run(),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(
                () => reject(new Error("probe_timeout")),
                2000,
              );
            }),
          ]);
          return {
            name: probe.name,
            required: probe.required,
            ...value,
            checkedAt: new Date().toISOString(),
          };
        } catch {
          return {
            name: probe.name,
            required: probe.required,
            state: "unavailable" as const,
            code: "probe_failed",
            checkedAt: new Date().toISOString(),
          };
        } finally {
          if (timer) clearTimeout(timer);
        }
      }),
    );
    return {
      ready: results.every((r) => !r.required || r.state === "available"),
      environment: this.environment,
      release: this.release,
      capabilities: results,
    };
  }
}
