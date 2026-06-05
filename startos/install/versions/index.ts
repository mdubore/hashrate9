import { VersionInfo } from '@start9labs/start-sdk'

export const v1_10_0_0 = VersionInfo.of({
  version: '1.10.0:0',
  releaseNotes:
    'Initial StartOS package for Hashrate Autopilot v1.10.0. Includes fee protection, configurable edit-price deadband, deadband history in edit tooltips, and chart-marker cap fixes from the upstream release.',
  migrations: {},
})

export const v1_11_0_0 = VersionInfo.of({
  version: '1.11.0:0',
  releaseNotes:
    'Updates Hashrate Autopilot to upstream v1.11.0. Includes the BIP 110 scanner restructure, Telegram payout-lifecycle alerts, chart color picker, historical network-difficulty backfill, and offline-period reconstruction.',
  migrations: {},
})

export const v1_12_0_0 = VersionInfo.of({
  version: '1.12.0:0',
  releaseNotes:
    'Updates Hashrate Autopilot to upstream v1.12.0. Includes public-IP change tracking, drag-to-reorder Status cards, configurable marker colors, return-on-spend P&L, Braiins share-rejection metrics, the Bitaxe miner rename, and migrations 0106-0109.',
  migrations: {},
})
