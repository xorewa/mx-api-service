import { ApiProperty } from '@nestjs/swagger';

export type DrwaGovernanceFinality = 'finalized' | 'pending' | 'reorg_pending';
export type DrwaGovernanceSource =
  | 'finalized_chain'
  | 'indexed_projection'
  | 'degraded';

export class DrwaGovernanceScope {
  constructor(init?: Partial<DrwaGovernanceScope>) {
    Object.assign(this, init);
  }

  @ApiProperty({ type: String })
  network: string = '';

  @ApiProperty({ type: String })
  projectId: string = '';

  @ApiProperty({ type: String })
  issuerId: string = '';

  @ApiProperty({ type: String, required: false })
  tokenId: string | undefined = undefined;

  @ApiProperty({ type: String })
  safeAddress: string = '';

  @ApiProperty({ type: String })
  authAdminAddress: string = '';

  @ApiProperty({ type: String })
  authAdminCodeHash: string = '';

  @ApiProperty({ type: Number })
  authAdminStorageVersion: number = 0;

  @ApiProperty({ type: Number })
  authAdminQuorum: number = 0;

  @ApiProperty({ type: Number })
  registryVersion: number = 0;

  @ApiProperty({ type: String })
  registryExpiresAt: string = '';
}

export class DrwaGovernanceProposal {
  constructor(init?: Partial<DrwaGovernanceProposal>) {
    Object.assign(this, init);
  }

  @ApiProperty({ type: Number })
  proposalId: number = 0;

  @ApiProperty({
    enum: [
      'update_caller',
      'add_signer',
      'remove_signer',
      'replace_signer',
      'change_quorum',
    ],
  })
  action:
    | 'update_caller'
    | 'add_signer'
    | 'remove_signer'
    | 'replace_signer'
    | 'change_quorum' = 'add_signer';

  @ApiProperty({ type: String, required: false })
  proposer: string | undefined = undefined;

  @ApiProperty({ type: [String] })
  signatures: string[] = [];

  @ApiProperty({ type: Number })
  quorum: number = 0;

  @ApiProperty({ type: String })
  state: string = 'pending';

  @ApiProperty({ type: Number, required: false })
  creationRound: number | undefined = undefined;

  @ApiProperty({ type: Number, required: false })
  expiryRound: number | undefined = undefined;

  @ApiProperty({ type: Number, required: false })
  timelockSeconds: number | undefined = undefined;

  /** ISO-8601 execution time derived from finalized quorum events and the
   * on-chain approved-at timestamp. Present only after quorum is reached. */
  @ApiProperty({ type: String, required: false })
  executableAt: string | undefined = undefined;

  @ApiProperty({ type: String, required: false })
  creationTxHash: string | undefined = undefined;

  @ApiProperty({ type: String, required: false })
  executionTxHash: string | undefined = undefined;

  @ApiProperty({ enum: ['finalized', 'pending', 'reorg_pending'] })
  finality: DrwaGovernanceFinality = 'finalized';
}

export class DrwaGovernanceResponse {
  constructor(init?: Partial<DrwaGovernanceResponse>) {
    Object.assign(this, init);
  }

  @ApiProperty({ type: [DrwaGovernanceProposal] })
  data: DrwaGovernanceProposal[] = [];

  @ApiProperty({ enum: ['finalized_chain', 'indexed_projection', 'degraded'] })
  source: DrwaGovernanceSource = 'degraded';

  @ApiProperty({ enum: ['finalized', 'pending', 'reorg_pending'] })
  finality: DrwaGovernanceFinality = 'pending';

  @ApiProperty({ type: String })
  asOf: string = new Date(0).toISOString();

  @ApiProperty({ type: Boolean })
  stale: boolean = true;

  @ApiProperty({ type: DrwaGovernanceScope, required: false })
  scope: DrwaGovernanceScope | undefined = undefined;
}
