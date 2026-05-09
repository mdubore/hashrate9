/**
 * Braiins on-chain deposit lifecycle watcher (#130).
 *
 * Polls `/v1/account/transaction/on-chain` on its own cadence,
 * upserts each deposit's current state into `braiins_deposits`, and
 * fires Telegram notifications on transitions:
 *
 *   - **Detected**  - first time we see a tx_id. INFO severity.
 *   - **Available** - status reaches the assumed "completed" enum
 *     value AND `return_tx_id` is null. INFO severity.
 *   - **Returned**  - `return_tx_id` is non-null. IMPORTANT severity
 *     (real money on the line; Braiins compliance bounced it back).
 *
 * Idempotent on every poll: the per-row `notified_*` flags ensure the
 * same lifecycle event doesn't refire on subsequent ticks even if the
 * deposit sits in a state for hours.
 *
 * When `notify_on_braiins_deposit = false` (the default), the watcher
 * still polls and updates the table - but for any not-yet-notified
 * event in the current state, it flips `notified_X = 1` *silently*
 * (no Telegram POST). This prevents a flood of historical alerts the
 * first time the operator toggles the feature on.
 *
 * The autopilot-side opt-out machinery in
 * `notification_disabled_event_classes` (#106) still applies on a
 * per-event-class basis - the toggle is the master switch, the
 * per-class list is the fine-grained override.
 *
 * Caveat: Braiins's `DepositStatus` enum maps integers 0..5 but the
 * exact mapping is not documented in the OpenAPI. We use 3 as the
 * "completed / available" threshold, matching the assumed
 * pending(0) / confirming(1) / under_review(2) / completed(3) /
 * rejected(4) / returned(5) ordering. If empirical responses differ,
 * adjust `AVAILABLE_STATUS_MIN` here - that's the single point of
 * configuration. The "Returned" detection is independent of the enum
 * (uses `return_tx_id != null`) and stable.
 */

import type { BraiinsClient } from '@braiins-hashrate/braiins-client';

import type { AppConfig } from '../config/schema.js';
import { getAlertCopy } from '../i18n/alert-copy.js';
import type {
  BraiinsDepositsRepo,
  DepositNotificationKind,
} from '../state/repos/braiins_deposits.js';
import type { AlertManager } from './alert-manager.js';

const DEFAULT_INTERVAL_MS = 60_000;
const FETCH_LIMIT = 100;
const AVAILABLE_STATUS_MIN = 3;

const SAT_PER_BTC = 100_000_000;

/** OnChainTransactionType: 0 = deposit per the assumed enum order. */
const TX_TYPE_DEPOSIT = 0;

export interface BraiinsDepositWatcherOptions {
  readonly cfgRef: { value: AppConfig };
  readonly braiinsClient: BraiinsClient;
  readonly depositsRepo: BraiinsDepositsRepo;
  readonly alertManager: AlertManager;
  readonly intervalMs?: number;
  readonly now?: () => number;
  readonly log?: (msg: string) => void;
}

export class BraiinsDepositWatcherService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;

  constructor(private readonly options: BraiinsDepositWatcherOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  start(): void {
    if (this.timer) return;
    const interval = this.options.intervalMs ?? DEFAULT_INTERVAL_MS;
    setTimeout(() => void this.tick(), 5_000);
    this.timer = setInterval(() => void this.tick(), interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One iteration. Never throws - any Braiins API failure is logged
   * and skipped; the next tick retries from scratch (the table is
   * idempotent so a partial walk that crashed mid-loop just resumes).
   */
  async tick(): Promise<void> {
    let response;
    try {
      response = await this.options.braiinsClient.getOnChainTransactions({ limit: FETCH_LIMIT });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.options.log?.(`[deposits] poll failed: ${msg}`);
      return;
    }

    const transactions = response?.transactions ?? [];
    const notifyOn = this.options.cfgRef.value.notify_on_braiins_deposit === true;

    for (const tx of transactions) {
      // Only handle deposits. Withdrawals / other types ride on the
      // same endpoint but aren't lifecycle events the operator asked
      // to be notified about.
      if (tx.tx_type !== TX_TYPE_DEPOSIT) continue;
      const tx_id = typeof tx.tx_id === 'string' ? tx.tx_id : '';
      if (!tx_id) continue;

      const amount_sat = Number(tx.amount_sat ?? 0);
      const status = Number(tx.deposit_status ?? 0);
      const return_tx_id = typeof tx.return_tx_id === 'string' && tx.return_tx_id.length > 0 ? tx.return_tx_id : null;
      const address = typeof tx.address === 'string' ? tx.address : null;

      // Snapshot the *previous* state before upserting the new one, so
      // we can decide which transitions are "newly observed."
      const prev = await this.options.depositsRepo.findByTxId(tx_id);

      const observed = await this.options.depositsRepo.upsertSeen({
        tx_id,
        amount_sat,
        address,
        status,
        return_tx_id,
        observed_at_ms: this.now(),
      });

      // Detected: fire iff we hadn't already notified detection.
      if (!observed.notified_detected) {
        await this.handleEvent({
          kind: 'detected',
          notifyOn,
          tx_id,
          payload: { amount_sat, address },
          severity: 'INFO',
        });
      }

      // Returned: stable on `return_tx_id` going non-null. Fire iff
      // we hadn't already notified the return.
      if (return_tx_id !== null && !observed.notified_returned) {
        await this.handleEvent({
          kind: 'returned',
          notifyOn,
          tx_id,
          payload: { amount_sat, return_tx_id },
          severity: 'IMPORTANT',
        });
        // A returned deposit cancels the "becoming available" path -
        // mark it absorbed so we never fire Available for it.
        if (!observed.notified_available) {
          await this.options.depositsRepo.markNotified(tx_id, 'available');
        }
        // Don't continue looking at the same tx for other transitions.
        continue;
      }

      // Available: status reached the threshold AND not returned.
      if (
        return_tx_id === null &&
        status >= AVAILABLE_STATUS_MIN &&
        !observed.notified_available
      ) {
        await this.handleEvent({
          kind: 'available',
          notifyOn,
          tx_id,
          payload: { amount_sat },
          severity: 'INFO',
        });
      }

      void prev; // (unused; reserved for future "transition direction" logic)
    }
  }

  private async handleEvent(args: {
    kind: DepositNotificationKind;
    notifyOn: boolean;
    tx_id: string;
    payload:
      | { amount_sat: number; address: string | null }
      | { amount_sat: number; return_tx_id: string }
      | { amount_sat: number };
    severity: 'INFO' | 'IMPORTANT';
  }): Promise<void> {
    const { kind, notifyOn, tx_id, payload, severity } = args;

    // When the master toggle is off we still consume the transition
    // (mark notified) so a future toggle-on does not flood with
    // backlog.
    if (!notifyOn) {
      await this.options.depositsRepo.markNotified(tx_id, kind);
      return;
    }

    const event_class = kindToEventClass(kind);
    // Per-event-class opt-out (#106) still applies under the master
    // toggle. Read the current cfg snapshot.
    const disabled = new Set(this.options.cfgRef.value.notification_disabled_event_classes);
    if (disabled.has(event_class)) {
      await this.options.depositsRepo.markNotified(tx_id, kind);
      return;
    }

    const { title, body } = renderMessage(kind, payload, this.options.cfgRef.value.notification_locale);
    try {
      await this.options.alertManager.recordAlert({
        severity,
        title,
        body,
        event_class,
      });
      await this.options.depositsRepo.markNotified(tx_id, kind);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.options.log?.(`[deposits] recordAlert(${kind} ${tx_id.slice(0, 12)}...) failed: ${msg}`);
      // Don't mark notified - retry on next poll.
    }
  }
}

function kindToEventClass(kind: DepositNotificationKind): string {
  switch (kind) {
    case 'detected':
      return 'braiins_deposit_detected';
    case 'available':
      return 'braiins_deposit_available';
    case 'returned':
      return 'braiins_deposit_returned';
  }
}

function formatSat(sat: number): string {
  // 100M sat threshold = 1 BTC, render BTC for ergonomics; otherwise sat.
  if (sat >= SAT_PER_BTC) {
    return `${(sat / SAT_PER_BTC).toFixed(8)} BTC (${sat.toLocaleString('en-US')} sat)`;
  }
  return `${sat.toLocaleString('en-US')} sat`;
}

function shortenTxId(tx_id: string): string {
  if (tx_id.length <= 16) return tx_id;
  return `${tx_id.slice(0, 8)}...${tx_id.slice(-8)}`;
}

function renderMessage(
  kind: DepositNotificationKind,
  payload: { amount_sat: number; address?: string | null; return_tx_id?: string },
  locale: string | null | undefined,
): { title: string; body: string } {
  const copy = getAlertCopy(locale);
  const amount = formatSat(payload.amount_sat);
  switch (kind) {
    case 'detected': {
      const address_short = payload.address ? payload.address.slice(0, 12) : null;
      return {
        title: copy.braiins_deposit_detected_title(),
        body: copy.braiins_deposit_detected_body({ amount, address_short }),
      };
    }
    case 'available':
      return {
        title: copy.braiins_deposit_available_title(),
        body: copy.braiins_deposit_available_body({ amount }),
      };
    case 'returned':
      return {
        title: copy.braiins_deposit_returned_title(),
        body: copy.braiins_deposit_returned_body({
          amount,
          return_tx_short: shortenTxId(payload.return_tx_id ?? 'unknown'),
        }),
      };
  }
}
