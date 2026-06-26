function unwrapOpt(value) {
  return Array.isArray(value) ? (value.length === 0 ? null : value[0]) : value ?? null;
}

function neuronIdValue(value) {
  const unwrapped = unwrapOpt(value);
  if (unwrapped === null || unwrapped === undefined) return null;
  if (typeof unwrapped === 'bigint') return unwrapped;
  if (typeof unwrapped === 'object' && 'id' in unwrapped) return BigInt(unwrapped.id);
  return BigInt(unwrapped);
}

function principalText(value) {
  const unwrapped = unwrapOpt(value);
  return unwrapped ? unwrapped.toString() : null;
}

function visibilityOf(fullNeuron, info) {
  const raw = unwrapOpt(fullNeuron?.visibility) ?? unwrapOpt(info?.visibility);
  if (raw === 2 || raw === 2n) return 'public';
  if (raw === 1 || raw === 1n) return 'private';
  return fullNeuron ? 'public' : 'unknown';
}

function fullNeuronId(fullNeuron) {
  return neuronIdValue(fullNeuron?.id);
}

function knownNeuronName(info, fallbackName = null) {
  const data = unwrapOpt(info?.known_neuron_data);
  return data?.name || fallbackName;
}

function normalizeNeuron(id, fullNeuron, info, knownNeuronNames) {
  const visibility = visibilityOf(fullNeuron, info);
  const isPublic = Boolean(fullNeuron);
  const stake = info?.stake_e8s ?? fullNeuron?.cached_neuron_stake_e8s ?? 0n;
  const controller = isPublic ? principalText(fullNeuron?.controller) : null;
  const knownName = knownNeuronNames.get(id.toString()) ?? null;
  const hotkeys = isPublic ? (fullNeuron.hot_keys ?? []).map((principal) => principal.toString()) : [];

  return {
    id,
    exists: true,
    visibility,
    public: isPublic,
    stakeE8s: BigInt(stake),
    controller,
    controllerLabel: controller ?? 'Anonymous',
    hotkeys,
    hotkeysPrivate: !isPublic,
    followeesPrivate: !isPublic,
    knownNeuronName: knownNeuronName(info, knownName),
    fullNeuron: fullNeuron ?? null,
    info: info ?? null,
  };
}

export function normalizeNeuronListResponse(response, requestedIds, knownNeuronNames = new Map()) {
  const fullById = new Map();
  for (const neuron of response.full_neurons ?? []) {
    const id = fullNeuronId(neuron);
    if (id !== null) fullById.set(id.toString(), neuron);
  }

  const infoById = new Map();
  for (const [id, info] of response.neuron_infos ?? []) {
    infoById.set(BigInt(id).toString(), info);
  }

  return requestedIds.map((id) => {
    const key = id.toString();
    const fullNeuron = fullById.get(key) ?? null;
    const info = infoById.get(key) ?? null;
    if (!fullNeuron && !info) {
      return { id, exists: false, knownNeuronName: knownNeuronNames.get(key) ?? null };
    }
    return normalizeNeuron(id, fullNeuron, info, knownNeuronNames);
  });
}

export function normalizeKnownNeuronNamesResponse(response) {
  const names = new Map();
  for (const known of response.known_neurons ?? []) {
    const id = neuronIdValue(known?.id);
    const data = unwrapOpt(known?.known_neuron_data);
    if (id !== null && data?.name) {
      names.set(id.toString(), data.name);
    }
  }
  return names;
}
