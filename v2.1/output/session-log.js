/**
 * output/session-log.js — the session log's shape and CSV form (spec §6.4).
 *
 * The log is a timeline of what the user loaded, changed and ran, for comparing runs and
 * troubleshooting. This module only defines an entry and serialises entries; keeping
 * them (browser storage) is the page's job, so this stays pure.
 */

import { toCsv } from './csv.js';

/** Log columns, in order. */
export const LOG_COLUMNS = ['time', 'event', 'item', 'from', 'to', 'note'];

/**
 * Make one log entry.
 * @param {string} time ISO timestamp, captured by the caller
 * @param {string} event what happened, e.g. 'points-loaded', 'parameter-changed', 'run'
 * @param {object} [detail]
 * @param {string} [detail.item] what it happened to (file name, parameter label)
 * @param {*} [detail.from] previous value, for changes
 * @param {*} [detail.to] new value, for changes
 * @param {string} [detail.note] free text (e.g. a run's headline counts)
 * @returns {{ time: string, event: string, item: string, from: *, to: *, note: string }}
 */
export function logEntry(time, event, { item = '', from = '', to = '', note = '' } = {}) {
  return { time, event, item, from, to, note };
}

/**
 * The log as CSV text.
 * @param {Array<object>} entries entries from {@link logEntry}, oldest first
 * @returns {string} CSV with {@link LOG_COLUMNS}
 * @determinism Pure function of its argument.
 */
export function sessionLogCsv(entries) {
  return toCsv(
    LOG_COLUMNS,
    entries.map((e) => LOG_COLUMNS.map((c) => e[c]))
  );
}
