const E8S_PER_ICP = 100_000_000n;

function toBigIntOrNull(value) {
  if (value === null || value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function formatIcpE8s(value, { compact = true } = {}) {
  const e8s = toBigIntOrNull(value);
  if (e8s === null) return 'Unavailable';
  const whole = e8s / E8S_PER_ICP;
  const fractional = e8s % E8S_PER_ICP;
  const numberValue = Number(whole) + Number(fractional) / Number(E8S_PER_ICP);
  if (compact && Number.isFinite(numberValue)) {
    return `${new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(numberValue)} ICP`;
  }
  return `${whole.toLocaleString('en-US')}.${fractional.toString().padStart(8, '0')} ICP`;
}

function normalizeError(error) {
  return {
    code: String(error?.code ?? 'TOKENOMICS_ERROR'),
    message: String(error?.message ?? ''),
  };
}

export function normalizeTokenomicsSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    sampledAtTimestampSeconds: Number(snapshot.sampledAtTimestampSeconds ?? 0),
    governanceMetricsTimestampSeconds: snapshot.governanceMetricsTimestampSeconds ?? null,
    totalSupplyE8s: toBigIntOrNull(snapshot.totalSupplyE8s),
    totalMaturityE8sEquivalent: toBigIntOrNull(snapshot.totalMaturityE8sEquivalent),
    totalStakedMaturityE8sEquivalent: toBigIntOrNull(snapshot.totalStakedMaturityE8sEquivalent),
    totalMaturityDisbursementsInProgressE8sEquivalent:
      toBigIntOrNull(snapshot.totalMaturityDisbursementsInProgressE8sEquivalent),
    totalStakedE8s: toBigIntOrNull(snapshot.totalStakedE8s),
    totalLockedE8s: toBigIntOrNull(snapshot.totalLockedE8s),
    belowVotingThresholdStakedE8s: toBigIntOrNull(snapshot.belowVotingThresholdStakedE8s),
    minDelayBandStakedE8s: toBigIntOrNull(snapshot.minDelayBandStakedE8s),
    middleDelayBandStakedE8s: toBigIntOrNull(snapshot.middleDelayBandStakedE8s),
    maxDelayBandStakedE8s: toBigIntOrNull(snapshot.maxDelayBandStakedE8s),
    dissolveDelayBucketGranularitySeconds:
      Number(snapshot.dissolveDelayBucketGranularitySeconds ?? 15_778_476),
    rewardEvent: snapshot.rewardEvent ?? null,
    icpBurnedTotalE8s: toBigIntOrNull(snapshot.icpBurnedTotalE8s),
    icpBurnedWeekDeltaE8s: toBigIntOrNull(snapshot.icpBurnedWeekDeltaE8s),
    provenance: (snapshot.provenance ?? []).map((item) => ({
      source: String(item.source ?? item.label ?? 'Unknown'),
      method: String(item.method ?? ''),
      detail: String(item.detail ?? ''),
    })),
    partial: Boolean(snapshot.partial),
    errors: (snapshot.errors ?? []).map(normalizeError),
  };
}

function seriesFromSnapshots(snapshots, key) {
  return snapshots
    .map((snapshot) => ({
      timestampSeconds: snapshot.sampledAtTimestampSeconds,
      value: snapshot[key],
    }))
    .filter((point) => point.value !== null);
}

export function prepareTokenomicsView({ latest = null, snapshots = [] } = {}) {
  const normalizedLatest = normalizeTokenomicsSnapshot(latest);
  const normalizedSnapshots = snapshots.map(normalizeTokenomicsSnapshot).filter(Boolean);
  return {
    latest: normalizedLatest,
    snapshots: normalizedSnapshots,
    unavailable: !normalizedLatest,
    partial: Boolean(normalizedLatest?.partial),
    errors: normalizedLatest?.errors ?? [],
    series: {
      maturity: seriesFromSnapshots(normalizedSnapshots, 'totalMaturityE8sEquivalent'),
      staked: seriesFromSnapshots(normalizedSnapshots, 'totalStakedE8s'),
      burned: seriesFromSnapshots(normalizedSnapshots, 'icpBurnedWeekDeltaE8s'),
      supply: seriesFromSnapshots(normalizedSnapshots, 'totalSupplyE8s'),
    },
  };
}

export function createTokenomicsService({ queryFacade }) {
  return Object.freeze({
    async loadTokenomics() {
      if (!queryFacade?.getLatestTokenomicsSnapshot) {
        return prepareTokenomicsView();
      }
      const [latest, page] = await Promise.all([
        queryFacade.getLatestTokenomicsSnapshot(),
        queryFacade.listTokenomicsSnapshots({ limit: 52 }),
      ]);
      return prepareTokenomicsView({
        latest,
        snapshots: page?.snapshots ?? [],
      });
    },
  });
}
