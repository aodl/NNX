// Browser-compatible, reduced declaration for the NNS Governance canister.
// Source: https://github.com/dfinity/ic/blob/master/rs/nns/governance/canister/governance.did
// Scope: this app only calls the `list_neurons` and `list_known_neurons` queries. The record shapes below keep
// the request fields we send and the response fields consumed by query-normalizers.js;
// extra upstream response fields are intentionally omitted from this checked-in browser declaration.
export const idlFactory = ({ IDL }) => {
  const NeuronId = IDL.Record({ id: IDL.Nat64 });
  const Followees = IDL.Record({ followees: IDL.Vec(NeuronId) });
  const KnownNeuronData = IDL.Record({
    name: IDL.Text,
    description: IDL.Opt(IDL.Text),
  });
  const NeuronInfo = IDL.Record({
    dissolve_delay_seconds: IDL.Nat64,
    recent_ballots: IDL.Vec(IDL.Record({
      vote: IDL.Int32,
      proposal_id: IDL.Opt(IDL.Record({ id: IDL.Nat64 })),
    })),
    created_timestamp_seconds: IDL.Nat64,
    state: IDL.Int32,
    stake_e8s: IDL.Nat64,
    joined_community_fund_timestamp_seconds: IDL.Opt(IDL.Nat64),
    retrieved_at_timestamp_seconds: IDL.Nat64,
    known_neuron_data: IDL.Opt(KnownNeuronData),
    voting_power: IDL.Nat64,
    age_seconds: IDL.Nat64,
    visibility: IDL.Opt(IDL.Int32),
  });
  const Neuron = IDL.Record({
    id: IDL.Opt(NeuronId),
    controller: IDL.Opt(IDL.Principal),
    hot_keys: IDL.Vec(IDL.Principal),
    cached_neuron_stake_e8s: IDL.Nat64,
    followees: IDL.Vec(IDL.Tuple(IDL.Int32, Followees)),
    visibility: IDL.Opt(IDL.Int32),
  });
  const ListNeurons = IDL.Record({
    neuron_ids: IDL.Vec(IDL.Nat64),
    include_neurons_readable_by_caller: IDL.Bool,
    include_empty_neurons_readable_by_caller: IDL.Opt(IDL.Bool),
    include_public_neurons_in_full_neurons: IDL.Opt(IDL.Bool),
    page_number: IDL.Opt(IDL.Nat64),
    page_size: IDL.Opt(IDL.Nat64),
    neuron_subaccounts: IDL.Opt(IDL.Vec(IDL.Record({ subaccount: IDL.Vec(IDL.Nat8) }))),
  });
  const ListNeuronsResponse = IDL.Record({
    neuron_infos: IDL.Vec(IDL.Tuple(IDL.Nat64, NeuronInfo)),
    full_neurons: IDL.Vec(Neuron),
    total_pages_available: IDL.Opt(IDL.Nat64),
  });
  const KnownNeuron = IDL.Record({
    id: IDL.Opt(NeuronId),
    known_neuron_data: IDL.Opt(KnownNeuronData),
  });
  const ListKnownNeuronsResponse = IDL.Record({
    known_neurons: IDL.Vec(KnownNeuron),
  });

  return IDL.Service({
    list_neurons: IDL.Func([ListNeurons], [ListNeuronsResponse], ['query']),
    list_known_neurons: IDL.Func([], [ListKnownNeuronsResponse], ['query']),
  });
};

export const init = ({ IDL }) => [IDL.Record({})];
