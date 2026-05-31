/**
 * #231: range-by-epoch helpers for the BIP 110 scanner.
 *
 * Bucketing and range alignment are the load-bearing bits of the
 * epoch redesign — they're what guarantee the per-bucket percentage
 * is directly comparable to the 55% MASF threshold. Test them
 * in isolation; the full route is integration-tested elsewhere.
 */

import { describe, expect, it } from 'vitest';

import { bucketByEpoch, computeScanRange } from './bip110-scan.js';

const EPOCH = 2016;

describe('computeScanRange', () => {
  it('current epoch only (pastEpochs=0): aligns startHeight to floor(tip/2016)*2016', () => {
    const r = computeScanRange(951_700, 0);
    expect(r.currentEpochStart).toBe(Math.floor(951_700 / EPOCH) * EPOCH);
    expect(r.startHeight).toBe(r.currentEpochStart);
  });

  it('current + 3 past: walks back 3 epoch lengths from the current-epoch start', () => {
    const tip = 951_700;
    const r = computeScanRange(tip, 3);
    const expectedCurrent = Math.floor(tip / EPOCH) * EPOCH;
    expect(r.currentEpochStart).toBe(expectedCurrent);
    expect(r.startHeight).toBe(expectedCurrent - 3 * EPOCH);
  });

  it('clamps startHeight at 0 when requested range walks past genesis', () => {
    const r = computeScanRange(EPOCH + 10, 12);
    expect(r.startHeight).toBe(0);
  });

  it('tip exactly on an epoch boundary: current epoch is empty (in_progress, 0 scanned)', () => {
    // tip = 2016k - 1 means the last block of an epoch; tip = 2016k
    // means the first block of the next epoch. Range still aligns to
    // the new epoch start.
    const tip = 5 * EPOCH; // first block of epoch 5
    const r = computeScanRange(tip, 0);
    expect(r.currentEpochStart).toBe(5 * EPOCH);
    expect(r.startHeight).toBe(5 * EPOCH);
  });
});

describe('bucketByEpoch', () => {
  const sig = (height: number) => ({ height, version: 0x20000010 }); // BIP 110 signal
  const nosig = (height: number) => ({ height, version: 0x20000000 });

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

  it('seeds empty buckets when no header lands in an epoch', () => {
    const start = 3 * EPOCH;
    const tip = 5 * EPOCH + 50;
    const currentEpochStart = 5 * EPOCH;
    // Only epoch 5 has headers; 3 and 4 should still appear as empty buckets.
    const headers = [sig(5 * EPOCH), nosig(5 * EPOCH + 1)];
    const buckets = bucketByEpoch(headers, start, currentEpochStart, tip);
    expect(buckets.map((b) => b.start_height)).toEqual([3 * EPOCH, 4 * EPOCH, 5 * EPOCH]);
    expect(buckets[0]!.scanned).toBe(0);
    expect(buckets[0]!.signaling_pct).toBe(0);
    expect(buckets[2]!.in_progress).toBe(true);
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
