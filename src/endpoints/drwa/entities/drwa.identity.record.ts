import { ApiProperty } from "@nestjs/swagger";

export class DrwaIdentityRecord {
  constructor(init?: Partial<DrwaIdentityRecord>) {
    Object.assign(this, init);
  }

  @ApiProperty({ type: String, nullable: true })
  address: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  tokenId: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  eventType: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  legalName: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  jurisdictionCode: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  registrationNumber: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  entityType: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  kycStatus: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  amlStatus: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  investorClass: string | undefined = undefined;

  @ApiProperty({ type: Number, nullable: true })
  expiryRound: number | undefined = undefined;

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

  @ApiProperty({ type: Number, nullable: true })
  timestamp: number | undefined = undefined;
}
