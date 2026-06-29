// Browser-compatible, reduced declaration for the NNS Governance canister.
// Source: https://github.com/dfinity/ic/blob/master/rs/nns/governance/canister/governance.did
// Scope: this app only calls the `list_neurons`, `list_known_neurons`, `list_node_providers`, `list_proposals`, and `get_proposal_info` queries. The record shapes below keep
// the request fields we send and the response fields consumed by query-normalizers.js;
// extra upstream response fields are intentionally omitted from this checked-in browser declaration.
export const idlFactory = ({ IDL }) => {
  const NeuronId = IDL.Record({ id: IDL.Nat64 });
  const ProposalId = IDL.Record({ id: IDL.Nat64 });
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
  const AccountIdentifier = IDL.Record({
    hash: IDL.Vec(IDL.Nat8),
  });
  const NodeProvider = IDL.Record({
    id: IDL.Opt(IDL.Principal),
    reward_account: IDL.Opt(AccountIdentifier),
  });
  const ListNodeProvidersResponse = IDL.Record({
    node_providers: IDL.Vec(NodeProvider),
  });
  const Tally = IDL.Record({
    yes: IDL.Nat64,
    no: IDL.Nat64,
    total: IDL.Nat64,
    timestamp_seconds: IDL.Nat64,
  });
  const Motion = IDL.Record({ motion_text: IDL.Text });
  const Action = IDL.Variant({
    RegisterKnownNeuron: IDL.Reserved,
    DeregisterKnownNeuron: IDL.Reserved,
    ManageNeuron: IDL.Reserved,
    UpdateCanisterSettings: IDL.Reserved,
    InstallCode: IDL.Reserved,
    StopOrStartCanister: IDL.Reserved,
    CreateServiceNervousSystem: IDL.Reserved,
    ExecuteNnsFunction: IDL.Reserved,
    RewardNodeProvider: IDL.Reserved,
    OpenSnsTokenSwap: IDL.Reserved,
    SetSnsTokenSwapOpenTimeWindow: IDL.Reserved,
    SetDefaultFollowees: IDL.Reserved,
    RewardNodeProviders: IDL.Reserved,
    ManageNetworkEconomics: IDL.Reserved,
    ApproveGenesisKyc: IDL.Reserved,
    AddOrRemoveNodeProvider: IDL.Reserved,
    Motion,
    FulfillSubnetRentalRequest: IDL.Reserved,
    BlessAlternativeGuestOsVersion: IDL.Reserved,
    TakeCanisterSnapshot: IDL.Reserved,
    LoadCanisterSnapshot: IDL.Reserved,
    CreateCanisterAndInstallCode: IDL.Reserved,
  });
  const SelfDescribingValue = IDL.Rec();
  SelfDescribingValue.fill(IDL.Variant({
    Blob: IDL.Vec(IDL.Nat8),
    Text: IDL.Text,
    Bool: IDL.Bool,
    Nat: IDL.Nat,
    Int: IDL.Int,
    Array: IDL.Vec(SelfDescribingValue),
    Map: IDL.Vec(IDL.Tuple(IDL.Text, SelfDescribingValue)),
    Null: IDL.Null,
  }));
  const SelfDescribingProposalAction = IDL.Record({
    type_name: IDL.Opt(IDL.Text),
    type_description: IDL.Opt(IDL.Text),
    value: IDL.Opt(SelfDescribingValue),
  });
  const Proposal = IDL.Record({
    title: IDL.Opt(IDL.Text),
    summary: IDL.Text,
    url: IDL.Text,
    action: IDL.Opt(Action),
    self_describing_action: IDL.Opt(SelfDescribingProposalAction),
  });
  const ProposalInfo = IDL.Record({
    id: IDL.Opt(ProposalId),
    status: IDL.Int32,
    topic: IDL.Int32,
    proposal_timestamp_seconds: IDL.Nat64,
    deadline_timestamp_seconds: IDL.Opt(IDL.Nat64),
    latest_tally: IDL.Opt(Tally),
    reward_status: IDL.Int32,
    decided_timestamp_seconds: IDL.Nat64,
    proposal: IDL.Opt(Proposal),
    proposer: IDL.Opt(NeuronId),
  });
  const ListProposalInfoRequest = IDL.Record({
    include_reward_status: IDL.Vec(IDL.Int32),
    omit_large_fields: IDL.Opt(IDL.Bool),
    before_proposal: IDL.Opt(ProposalId),
    limit: IDL.Nat32,
    exclude_topic: IDL.Vec(IDL.Int32),
    include_all_manage_neuron_proposals: IDL.Opt(IDL.Bool),
    include_status: IDL.Vec(IDL.Int32),
    return_self_describing_action: IDL.Opt(IDL.Bool),
  });
  const ListProposalInfoResponse = IDL.Record({
    proposal_info: IDL.Vec(ProposalInfo),
  });

  return IDL.Service({
    list_neurons: IDL.Func([ListNeurons], [ListNeuronsResponse], ['query']),
    list_known_neurons: IDL.Func([], [ListKnownNeuronsResponse], ['query']),
    list_node_providers: IDL.Func([], [ListNodeProvidersResponse], ['query']),
    get_proposal_info: IDL.Func([IDL.Nat64], [IDL.Opt(ProposalInfo)], ['query']),
    list_proposals: IDL.Func([ListProposalInfoRequest], [ListProposalInfoResponse], ['query']),
  });
};

export const init = ({ IDL }) => [IDL.Record({})];
