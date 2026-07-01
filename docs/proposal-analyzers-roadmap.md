# Proposal Analyzers Roadmap

NNX prioritizes unsupported analyzers by current open proposals, infrastructure
relevance, feasibility from allowed onchain/system sources, recent frequency, and
vote-readiness impact.

## Next Analyzer Family: OS / Version / Node Admin

Initial scope should parse and display evidence without overclaiming
validation.

Candidate NNS functions:

- `NNS_FUNCTION_DEPLOY_GUESTOS_TO_SOME_API_BOUNDARY_NODES`
- `NNS_FUNCTION_DEPLOY_GUESTOS_TO_ALL_UNASSIGNED_NODES`
- `NNS_FUNCTION_UPDATE_SSH_READONLY_ACCESS_FOR_ALL_UNASSIGNED_NODES`
- `NNS_FUNCTION_REVISE_ELECTED_HOSTOS_VERSIONS`
- `NNS_FUNCTION_DEPLOY_HOSTOS_TO_SOME_NODES`
- `NNS_FUNCTION_SET_SUBNET_OPERATIONAL_LEVEL`
- `NNS_FUNCTION_SPLIT_SUBNET`
- `NNS_FUNCTION_DELETE_SUBNET`

Fields to parse:

- node IDs
- subnet IDs
- API-boundary node IDs
- version ID/hash
- elected or unelected version IDs
- target kind: subnet nodes, unassigned nodes, API-boundary nodes
- action phase: elect, revise, deploy, retire

Allowed evidence:

- Governance proposal payload and self-describing action fields
- Registry node/subnet membership and version-related records when available
- Certified API-boundary membership for API-boundary targets
- Historian node metrics only when the proposal action actually needs measured
  node evidence

NNX can validate:

- referenced target IDs parse and normalize
- target nodes are known when node records are available
- subnet membership is available for subnet-targeted deployments
- certified API-boundary membership is available for API-boundary targets

Manual review remains required for:

- release artifact provenance
- operational rollout intent
- elected version evidence when Registry records are unavailable
- any free-text-only target extraction

Pre-execution checks:

- target set parses without conflict
- target membership is currently observable from allowed sources
- API-boundary targets use certified membership only

Post-execution checks:

- target records still exist
- membership or assignment changed only where the action has a deterministic
  onchain postcondition
- missing elected-version evidence is manual-review, not warning

Fixtures needed:

- at least one current open OS/version deployment proposal
- at least one current open OS/version election or revise proposal

Do not add offchain release-artifact validation without explicit approval.

