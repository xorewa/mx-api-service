# DRWA governance read model

`GET /rwa/drwa-governance/proposals?safe=<bech32-safe>` is the read model
consumed by xSafe's DRWA route. It is deliberately fail-closed: an invalid,
expired, incomplete, non-finalized, or chain-inconsistent result is returned as
`{ source: "degraded", finality: "pending", stale: true, data: [] }`.

## Required deployment inputs

The API process must receive all three values below. They are not optional
feature flags and no fallback address is used.

```text
DRWA_GOVERNANCE_REGISTRY_BASE64=<base64 of the exact UTF-8 registry JSON>
DRWA_GOVERNANCE_REGISTRY_SIGNATURE_BASE64=<base64 Ed25519 detached signature>
DRWA_GOVERNANCE_REGISTRY_PUBLIC_KEY=<PEM SPKI Ed25519 public key>
```

The signature is verified over the decoded registry bytes exactly as supplied.
The registry is discovery and consistency evidence only; it does not grant a
Safe any on-chain authority.

## Registry document

```json
{
  "version": 1,
  "issuedAt": "2026-07-22T00:00:00.000Z",
  "expiresAt": "2026-08-22T00:00:00.000Z",
  "scopes": [
    {
      "network": "local-devnet",
      "projectId": "example-project",
      "issuerId": "example-issuer",
      "tokenId": "OPTIONAL-1234",
      "safeAddress": "erd1...",
      "authAdminAddress": "erd1...",
      "authAdminCodeHash": "<gateway code hash>",
      "authAdminStorageVersion": 3,
      "authAdminQuorum": 3
    }
  ]
}
```

`safeAddress` is unique within one registry. The `network` value must match the
API's configured network exactly. The auth-admin address, code hash, storage
version, and quorum are all reconciled against the configured chain before
events are returned.

## Indexer prerequisite

The `drwa-control-events` index must contain finalization-updated records for
the configured `authAdminAddress`, including preserved `emitter` and raw event
`data`. The API accepts only finalized records from that exact emitter and
requires an unbroken lifecycle for every action from `1` through
`getNextActionId() - 1`. A partial backfill, a reorg-pending record, or an
unknown/malformed event makes the response degraded.

The quorum displayed for a proposal is the reconciled **current** auth-admin
quorum. Proposal events themselves do not carry a historical quorum snapshot;
clients must not interpret this field as proof of a prior quorum when the
contract's quorum has subsequently changed. Once finalized events show that
current quorum is met, the API reads `getActionApprovedAtTimestampSeconds` and
derives `executableAt` from that value plus the action's emitted timelock.

## xSafe configuration

xSafe must set `VITE_DRWA_GOVERNANCE_API_URL` to this API's HTTP(S) origin. It
adds the route-scoped Safe as the required `safe` query parameter. It must not
fall back to xSafe's Standard selected Safe.

No production registry signer, signing workflow, or revocation authority is
defined by this document. Those remain a governed operational decision; do not
insert an arbitrary local key or registry into a production environment.
