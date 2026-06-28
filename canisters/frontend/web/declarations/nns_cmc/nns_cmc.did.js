// Browser-compatible, reduced declaration for the NNS Cycles Minting Canister.
// Source: https://github.com/dfinity/ic/blob/master/rs/nns/cmc/cmc.did
// Scope: this app only reads CMC subnet placement maps for display.
export const idlFactory = ({ IDL }) => {
  const SubnetTypesToSubnetsResponse = IDL.Record({
    data: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(IDL.Principal))),
  });

  return IDL.Service({
    get_default_subnets: IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    get_subnet_types_to_subnets: IDL.Func([], [SubnetTypesToSubnetsResponse], ['query']),
  });
};

export const init = ({ IDL }) => [IDL.Opt(IDL.Record({}))];
