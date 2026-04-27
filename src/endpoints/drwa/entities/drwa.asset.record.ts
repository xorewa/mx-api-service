import { ApiProperty } from "@nestjs/swagger";

export class DrwaAssetRecord {
  constructor(init?: Partial<DrwaAssetRecord>) {
    Object.assign(this, init);
  }

  @ApiProperty({ type: String, nullable: true })
  tokenId: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  identifier: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  carrierType: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  assetClass: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  policyId: string | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  regulated: boolean | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  windDownInitiated: boolean | undefined = undefined;

  @ApiProperty({ type: Number, nullable: true })
  windDownRound: number | undefined = undefined;

  @ApiProperty({ type: Number, nullable: true })
  registeredRound: number | undefined = undefined;
}
