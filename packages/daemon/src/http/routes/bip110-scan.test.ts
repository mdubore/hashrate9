/**
 * #231: range-by-epoch helpers for the BIP 110 scanner.
 *
 * Bucketing and range alignment are the load-bearing bits of the
 * epoch redesign — they're what guarantee the per-bucket percentage
 * is directly comparable to the 55% MASF threshold. Test them
 * in isolation; the full route is integration-tested elsewhere.
 */

import { describe, expect, it } from 'vitest';

import {
  BIP110_FIRST_SIGNALING_BLOCK_HEIGHT,
  bucketByEpoch,
  computeScanRange,
} from './bip110-scan.js';

const EPOCH = 2016;

describe('computeScanRange', () => {
  it('range=current: startHeight equals the current epoch start (floor of tip)', () => {
    const r = computeScanRange(951_700, 'current');
    const expectedCurrent = Math.floor(951_700 / EPOCH) * EPOCH;
    expect(r.currentEpochStart).toBe(expectedCurrent);
    expect(r.startHeight).toBe(expectedCurrent);
  });

  it('range=all: startHeight snaps to the epoch boundary at or below the first BIP 110 block', () => {
    const r = computeScanRange(951_700, 'all');
    const expectedStart = Math.floor(BIP110_FIRST_SIGNALING_BLOCK_HEIGHT / EPOCH) * EPOCH;
    expect(r.startHeight).toBe(expectedStart);
    expect(r.startHeight % EPOCH).toBe(0);
    // currentEpochStart unaffected by the range — always the floor of tip.
    expect(r.currentEpochStart).toBe(Math.floor(951_700 / EPOCH) * EPOCH);
  });

  it('range=all spans many epochs (sanity check on bucket count)', () => {
    const tip = 951_700;
    const r = computeScanRange(tip, 'all');
    const epochsCovered = (r.currentEpochStart - r.startHeight) / EPOCH + 1;
    // ~6-7 epochs from BIP110_FIRST_SIGNALING_BLOCK_HEIGHT (938_903)
    // through current as of the spec date. The exact count depends
    // on tip — just confirm we're in the right order of magnitude.
    expect(epochsCovered).toBeGreaterThanOrEqual(5);
    expect(epochsCovered).toBeLessThanOrEqual(20);
  });

  it('tip exactly on an epoch boundary: current epoch starts at the new boundary', () => {
    const tip = (BIP110_FIRST_SIGNALING_BLOCK_HEIGHT + 10 * EPOCH); // pick a far-enough tip
    const epochStart = Math.floor(tip / EPOCH) * EPOCH;
    const r = computeScanRange(epochStart, 'current');
    expect(r.currentEpochStart).toBe(epochStart);
    expect(r.startHeight).toBe(epochStart);
  });
});

describe('bucketByEpoch', () => {
  // Timestamps are seconds-since-epoch in bitcoind block headers.
  // We pick a reasonable base time so the assertions on `_time_ms`
  // are easy to read.
  const BASE = 1_700_000_000; // 2023-11-14T22:13:20Z, doesn't matter
  const sig = (height: number, time = BASE + height * 600) => ({
    height,
    version: 0x20000010,
    time,
  });
  const nosig = (height: number, time = BASE + height * 600) => ({
    height,
    version: 0x20000000,
    time,
  });

  it('puts each height into the right epoch bucket and computes pct', () => {
    const start = 4 * EPOCH;
    const tip = 5 * EPOCH + 100;
    const currentEpochStart = 5 * EPOCH;
    const headers = [
      // Epoch 4: 2 signaling out of 4 scanned (50%)
      sig(4 * EPOCH), sig(4 * EPOCH + 1), nosig(4 * EPOCH + 2), nosig(4 * EPOCH + 3),
      // Epoch 5 (in progress): 3 signaling out of 4 scanned (75%)
      sig(5 * EPOCH), sig(5 * EPOCH + 1), sig(5 * EPOCH + 2), nosig(5 * EPOCH + 3),
    ];
    const buckets = bucketByEpoch(headers, start, currentEpochStart, tip);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({
      start_height: 4 * EPOCH,
      end_height: 4 * EPOCH + EPOCH - 1,
      scanned: 4,
      signaling_count: 2,
      signaling_pct: 50,
      in_progress: false,
    });
    expect(buckets[1]).toMatchObject({
      start_height: 5 * EPOCH,
      end_height: tip,
      scanned: 4,
      signaling_count: 3,
      signaling_pct: 75,
      in_progress: true,
    });
  });

  it('captures start_time_ms / end_time_ms from min / max scanned header times', () => {
    const start = 4 * EPOCH;
    const tip = 5 * EPOCH + 100;
    const currentEpochStart = 5 * EPOCH;
    const headers = [
      // Epoch 4 — three headers with deliberately non-monotone times
      // (block time isn't strictly monotonic in Bitcoin; min/max
      // tracking has to handle that).
      sig(4 * EPOCH, BASE + 100),
      nosig(4 * EPOCH + 1, BASE + 50),
      sig(4 * EPOCH + 2, BASE + 200),
      // Epoch 5 — one header
      nosig(5 * EPOCH, BASE + 500),
    ];
    const buckets = bucketByEpoch(headers, start, currentEpochStart, tip);
    expect(buckets[0]!.start_time_ms).toBe((BASE + 50) * 1000);
    expect(buckets[0]!.end_time_ms).toBe((BASE + 200) * 1000);
    expect(buckets[1]!.start_time_ms).toBe((BASE + 500) * 1000);
    expect(buckets[1]!.end_time_ms).toBe((BASE + 500) * 1000);
  });

  it('seeds empty buckets when no header lands in an epoch — timestamps are null', () => {
    const start = 3 * EPOCH;
    const tip = 5 * EPOCH + 50;
    const currentEpochStart = 5 * EPOCH;
    // Only epoch 5 has headers; 3 and 4 should still appear as empty buckets.
    const headers = [sig(5 * EPOCH), nosig(5 * EPOCH + 1)];
    const buckets = bucketByEpoch(headers, start, currentEpochStart, tip);
    expect(buckets.map((b) => b.start_height)).toEqual([3 * EPOCH, 4 * EPOCH, 5 * EPOCH]);
    expect(buckets[0]!.scanned).toBe(0);
    expect(buckets[0]!.signaling_pct).toBe(0);
    expect(buckets[0]!.start_time_ms).toBeNull();
    expect(buckets[0]!.end_time_ms).toBeNull();
    expect(buckets[2]!.in_progress).toBe(true);
    expect(buckets[2]!.start_time_ms).not.toBeNull();
  });

  it('current-epoch-only scan reflects in-progress signaling pct (comparable to 55% MASF)', () => {
    const tip = 5 * EPOCH + 999; // halfway through epoch 5
    const start = 5 * EPOCH;
    const currentEpochStart = 5 * EPOCH;
    // 600 of 1000 scanned signal → 60% (over MASF threshold)
    const headers = Array.from({ length: 1000 }, (_, i) =>
      i < 600 ? sig(5 * EPOCH + i) : nosig(5 * EPOCH + i),
    );
    const buckets = bucketByEpoch(headers, start, currentEpochStart, tip);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.scanned).toBe(1000);
    expect(buckets[0]!.signaling_count).toBe(600);
    expect(buckets[0]!.signaling_pct).toBe(60);
    expect(buckets[0]!.in_progress).toBe(true);
    expect(buckets[0]!.end_height).toBe(tip);
  });
});
