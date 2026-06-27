// Browser-compatible, reduced declaration for the NNS Registry canister.
// Source: https://github.com/dfinity/ic/blob/master/rs/registry/canister/canister/registry.did
// Scope: this app only calls Candid-safe topology queries. The record shapes below keep
// the request fields we send and the response fields consumed by topology-normalizers.js;
// extra upstream response fields are intentionally omitted from this checked-in browser declaration.
export const idlFactory = ({ IDL }) => {
  const Gps = IDL.Record({
    latitude: IDL.Float32,
    longitude: IDL.Float32,
  });
  const DataCenterRecord = IDL.Record({
    id: IDL.Text,
    gps: IDL.Opt(Gps),
    region: IDL.Text,
    owner: IDL.Text,
  });
  const NodeOperatorRecord = IDL.Record({
    ipv6: IDL.Opt(IDL.Text),
    max_rewardable_nodes: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat32)),
    node_operator_principal_id: IDL.Vec(IDL.Nat8),
    node_allowance: IDL.Nat64,
    rewardable_nodes: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat32)),
    node_provider_principal_id: IDL.Vec(IDL.Nat8),
    dc_id: IDL.Text,
  });
  const GetNodeOperatorsAndDcsOfNodeProviderResponse = IDL.Variant({
    Ok: IDL.Vec(IDL.Tuple(DataCenterRecord, NodeOperatorRecord)),
    Err: IDL.Text,
  });
  const GetSubnetRequest = IDL.Record({
    subnet_id: IDL.Opt(IDL.Principal),
  });
  const SubnetType = IDL.Variant({
    application: IDL.Null,
    verified_application: IDL.Null,
    system: IDL.Null,
    cloud_engine: IDL.Null,
  });
  const SubnetRecord = IDL.Record({
    membership: IDL.Vec(IDL.Vec(IDL.Nat8)),
    replica_version_id: IDL.Text,
    subnet_type: SubnetType,
    is_halted: IDL.Bool,
  });
  const GetSubnetResponse = IDL.Variant({
    Ok: SubnetRecord,
    Err: IDL.Text,
  });
  const GetSubnetForCanisterRequest = IDL.Record({
    principal: IDL.Opt(IDL.Principal),
  });
  const GetSubnetForCanisterResponse = IDL.Variant({
    Ok: IDL.Record({ subnet_id: IDL.Opt(IDL.Principal) }),
    Err: IDL.Text,
  });

  return IDL.Service({
    get_node_operators_and_dcs_of_node_provider: IDL.Func(
      [IDL.Principal],
      [GetNodeOperatorsAndDcsOfNodeProviderResponse],
      ['query'],
    ),
    get_subnet: IDL.Func([GetSubnetRequest], [GetSubnetResponse], ['query']),
    get_subnet_for_canister: IDL.Func(
      [GetSubnetForCanisterRequest],
      [GetSubnetForCanisterResponse],
      ['query'],
    ),
  });
};

export const init = ({ IDL }) => [IDL.Record({})];
