/**
 * Align N independent time-series into one row-per-date chart-data array.
 *
 * The backend returns each metric (views / reach / interactions / ...) as its
 * own `[{end_time, value}]` array. Naively zipping by index — which is what
 * the dashboard used to do — breaks the moment any metric is missing a day,
 * because every subsequent point then plots on the wrong date.
 *
 * This helper builds the sorted union of `end_time` values across all input
 * series and emits one row per unique date with each series's value looked up
 * by date. Missing values are `null` (not 0) so charts can skip the gap
 * cleanly with `connectNulls`.
 *
 * @param {Record<string, Array<{end_time: string, value: number}>>} seriesByKey
 *   Map of output-column-name -> backend time-series array. Keys become the
 *   property names on each returned row.
 * @returns {Array<Record<string, string | number | null>>}
 *   `[{ end_time, [key]: value | null, ... }]`, sorted by `end_time` ascending.
 */
export function alignSeriesByDate(seriesByKey) {
  const maps = {};
  const allDates = new Set();
  for (const [key, series] of Object.entries(seriesByKey)) {
    const map = new Map();
    for (const point of series ?? []) {
      if (!point || !point.end_time) continue;
      map.set(point.end_time, point.value);
      allDates.add(point.end_time);
    }
    maps[key] = map;
  }
  const dates = Array.from(allDates).sort();
  return dates.map((end_time) => {
    const row = { end_time };
    for (const [key, map] of Object.entries(maps)) {
      row[key] = map.has(end_time) ? map.get(end_time) : null;
    }
    return row;
  });
}

/**
 * Attach prior-period values to an already date-aligned chart-data array.
 *
 * Prior overlays compare day-N-of-current vs day-N-of-prior (not date-to-date,
 * since the two windows are by definition different calendar ranges), so we
 * sort each prior series chronologically and zip into `chartData` by index.
 * Rows past the prior series's length get `null` for that key.
 *
 * Returns a NEW array of NEW row objects — does not mutate the input, so
 * callers can safely memoize the input across renders.
 *
 * @param {Array<Record<string, unknown>>} chartData - rows from alignSeriesByDate.
 * @param {Record<string, Array<{end_time: string, value: number}>>} priorByKey
 *   Map of output-column-name -> prior-period time-series array.
 * @returns {Array<Record<string, unknown>>} New rows with added prior-keyed values.
 */
export function attachPriorByIndex(chartData, priorByKey) {
  const priorByKeySorted = {};
  for (const [key, series] of Object.entries(priorByKey)) {
    priorByKeySorted[key] = [...(series ?? [])]
      .filter((p) => p && p.end_time != null)
      .sort((a, b) => (a.end_time < b.end_time ? -1 : 1));
  }
  return chartData.map((row, i) => {
    const next = { ...row };
    for (const [key, sorted] of Object.entries(priorByKeySorted)) {
      next[key] = sorted[i]?.value ?? null;
    }
    return next;
  });
}
