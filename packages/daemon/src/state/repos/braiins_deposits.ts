/**
 * Repository for the `braiins_deposits` table (#130).
 *
 * One row per Braiins-side on-chain deposit ever observed by the
 * watcher. The `notified_*` flags are per-event idempotency markers
 * so the same deposit doesn't refire its lifecycle alert on every
 * poll cycle.
 *
 * Returns are detected via a non-null `last_seen_return_tx_id`
 * (per Braiins OpenAPI: `return_tx_id` is "returned deposits only"),
 * which is more reliable than guessing the `DepositStatus` enum
 * mapping. "Available" is best-effort: we use the highest enum value
 * we observe (3 by default, matching the assumed
 * pending/confirming/under-review/completed ordering) AND a null
 * `return_tx_id` as the "deposit is now spendable on Braiins" cue.
 * If empirical Braiins responses use a different mapping, the
 * threshold constant in `services/braiins-deposit-watcher.ts` is the
 * single point of update.
 */

import type { Kysely } from 'kysely';

import type { Database } from '../types.js';

export type DepositNotificationKind = 'detected' | 'available' | 'returned';

export interface BraiinsDepositRow {
  readonly tx_id: string;
  readonly amount_sat: number;
  readonly address: string | null;
  readonly last_seen_status: number;
  readonly last_seen_return_tx_id: string | null;
  readonly first_seen_at_ms: number;
  readonly updated_at_ms: number;
  readonly notified_detected: boolean;
  readonly notified_available: boolean;
  readonly notified_returned: boolean;
}

export interface UpsertSeenArgs {
  readonly tx_id: string;
  readonly amount_sat: number;
  readonly address: string | null;
  readonly status: number;
  readonly return_tx_id: string | null;
  readonly observed_at_ms: number;
}

export class BraiinsDepositsRepo {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Upsert the row's current observed state. New rows are inserted
   * with all `notified_*` flags = 0. Existing rows have their state
   * fields refreshed but `notified_*` flags are preserved (ON
   * CONFLICT DO UPDATE).
   */
  async upsertSeen(args: UpsertSeenArgs): Promise<BraiinsDepositRow> {
    await this.db
      .insertInto('braiins_deposits')
      .values({
        tx_id: args.tx_id,
        amount_sat: args.amount_sat,
        address: args.address,
        last_seen_status: args.status,
        last_seen_return_tx_id: args.return_tx_id,
        first_seen_at_ms: args.observed_at_ms,
        updated_at_ms: args.observed_at_ms,
        notified_detected: 0,
        notified_available: 0,
        notified_returned: 0,
      })
      .onConflict((oc) =>
        oc.column('tx_id').doUpdateSet({
          last_seen_status: args.status,
          last_seen_return_tx_id: args.return_tx_id,
          updated_at_ms: args.observed_at_ms,
          // amount_sat is immutable per Braiins's own contract; address
          // could change if Braiins ever cycles its receiving keys.
          // Keep them refreshed defensively.
          amount_sat: args.amount_sat,
          address: args.address,
        }),
      )
      .execute();

    const row = await this.findByTxId(args.tx_id);
    if (!row) {
      throw new Error(`upsertSeen: row vanished after upsert (${args.tx_id})`);
    }
    return row;
  }

  async findByTxId(tx_id: string): Promise<BraiinsDepositRow | null> {
    const row = await this.db
      .selectFrom('braiins_deposits')
      .selectAll()
      .where('tx_id', '=', tx_id)
      .executeTakeFirst();
    if (!row) return null;
    return {
      tx_id: row.tx_id,
      amount_sat: row.amount_sat,
      address: row.address,
      last_seen_status: row.last_seen_status,
      last_seen_return_tx_id: row.last_seen_return_tx_id,
      first_seen_at_ms: row.first_seen_at_ms,
      updated_at_ms: row.updated_at_ms,
      notified_detected: row.notified_detected === 1,
      notified_available: row.notified_available === 1,
      notified_returned: row.notified_returned === 1,
    };
  }

  /**
   * Flip a single `notified_*` flag to 1. Used by both the actual
   * notification path (after the alert manager records the alert)
   * and the "silently absorb backlog when toggle is off" path.
   */
  async markNotified(tx_id: string, kind: DepositNotificationKind): Promise<void> {
    const col =
      kind === 'detected'
        ? 'notified_detected'
        : kind === 'available'
          ? 'notified_available'
          : 'notified_returned';
    await this.db
      .updateTable('braiins_deposits')
      .set({ [col]: 1 })
      .where('tx_id', '=', tx_id)
      .execute();
  }
}
