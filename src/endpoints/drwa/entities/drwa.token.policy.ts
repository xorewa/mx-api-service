import { ApiProperty } from "@nestjs/swagger";

export class DrwaTokenPolicyHistoryEntry {
  constructor(init?: Partial<DrwaTokenPolicyHistoryEntry>) {
    Object.assign(this, init);
  }

  @ApiProperty({ type: String })
  eventType: string = '';

  @ApiProperty({ type: Boolean, nullable: true })
  regulated: boolean | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  globalPause: boolean | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  strictAuditorMode: boolean | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  whitePaperCid: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  registrationStatus: string | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  windDownInitiated: boolean | undefined = undefined;

  @ApiProperty({ type: Number, nullable: true })
  tokenPolicyVersion: number | undefined = undefined;

  @ApiProperty({ type: Number, nullable: true })
  timestamp: number | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  tokenId: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  identifier: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  action: string | undefined = undefined;

  @ApiProperty({ type: Number, nullable: true })
  shardId: number | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  blockHash: string | undefined = undefined;

  @ApiProperty({ type: Number, nullable: true })
  blockRound: number | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  isFinalized: boolean | undefined = undefined;

  @ApiProperty({ type: Number, nullable: true })
  eventOrder: number | undefined = undefined;
}

export class DrwaTokenPolicy {
  constructor(init?: Partial<DrwaTokenPolicy>) {
    Object.assign(this, init);
  }

  @ApiProperty({ type: Boolean, nullable: true })
  regulated: boolean | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  tokenId: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  identifier: string | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  drwaEnabled: boolean | undefined = undefined;

  @ApiProperty({ type: Number, nullable: true })
  tokenPolicyVersion: number | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  globalPause: boolean | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  strictAuditorMode: boolean | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  metadataProtectionEnabled: boolean | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  travelRuleRequired: boolean | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  sanctionsScreeningEnabled: boolean | undefined = undefined;

  @ApiProperty({ type: [String], nullable: true })
  allowedInvestorClasses: string[] | undefined = undefined;

  @ApiProperty({ type: [String], nullable: true })
  allowedJurisdictions: string[] | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  whitePaperCid: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  registrationStatus: string | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  windDownInitiated: boolean | undefined = undefined;

  @ApiProperty({ type: () => [DrwaTokenPolicyHistoryEntry], nullable: true })
  history: DrwaTokenPolicyHistoryEntry[] | undefined = undefined;
}
