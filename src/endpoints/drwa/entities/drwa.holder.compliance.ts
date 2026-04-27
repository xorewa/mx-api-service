import { ApiProperty } from "@nestjs/swagger";

export class DrwaHolderCompliance {
  constructor(init?: Partial<DrwaHolderCompliance>) {
    Object.assign(this, init);
  }

  @ApiProperty({ type: String, nullable: true })
  tokenId: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  holder: string | undefined = undefined;

  @ApiProperty({ type: Number, nullable: true })
  holderPolicyVersion: number | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  kycStatus: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  amlStatus: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  investorClass: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  jurisdictionCode: string | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  transferLocked: boolean | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  receiveLocked: boolean | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  auditorAuthorized: boolean | undefined = undefined;

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
}
