/** How often the solar forecast is asked for again (ms): it changes a few times a day. */
export const FORECAST_REFRESH_MS = 30 * 60_000;

/**
 * The forecast of the solar production in watt hours per hour, from the answer of Home Assistant to
 * `energy/solar_forecast` (one entry per forecast integration, each with `wh_hours` by time stamp): the hours of all
 * entries are added up, keyed by the start of the hour in milliseconds. Entries that cannot be read are skipped.
 */
export function parseSolarForecast(result: unknown): Map<number, number> {
  const out = new Map<number, number>();
  if (typeof result !== "object" || result === null) return out;
  for (const entry of Object.values(result as Record<string, unknown>)) {
    const hours = (entry as { wh_hours?: unknown } | null)?.wh_hours;
    if (typeof hours !== "object" || hours === null) continue;
    for (const [stamp, wh] of Object.entries(hours as Record<string, unknown>)) {
      const t = Date.parse(stamp);
      if (!Number.isFinite(t) || typeof wh !== "number" || !Number.isFinite(wh)) continue;
      const hour = t - (t % 3_600_000);
      out.set(hour, (out.get(hour) ?? 0) + Math.max(0, wh));
    }
  }
  return out;
}

/**
 * The forecast per bar of a period: the sum of its hours, undefined for a bar the forecast does not cover (it
 * reaches a few days ahead and the running day). A bar counts as covered when its first hour is known.
 */
export function forecastBars(hours: Map<number, number>, starts: number[], end: number): Array<number | undefined> {
  if (!hours.size) return starts.map(() => undefined);
  return starts.map((start, i) => {
    const stop = starts[i + 1] ?? end;
    if (!hours.has(start - (start % 3_600_000))) return undefined;
    let sum = 0;
    for (let t = start - (start % 3_600_000); t < stop; t += 3_600_000) sum += hours.get(t) ?? 0;
    return sum;
  });
}
