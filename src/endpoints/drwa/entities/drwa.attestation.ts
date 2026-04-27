import { ApiProperty } from "@nestjs/swagger";

export class DrwaAttestation {
  constructor(init?: Partial<DrwaAttestation>) {
    Object.assign(this, init);
  }

  @ApiProperty({ type: String })
  txHash: string = '';

  @ApiProperty({ type: String, nullable: true })
  tokenId: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  subject: string | undefined = undefined;

  @ApiProperty({ type: String })
  auditor: string = '';

  @ApiProperty({ type: String })
  eventType: string = '';

  @ApiProperty({ type: String, nullable: true })
  attestationType: string | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  approved: boolean | undefined = undefined;

  @ApiProperty({ type: Number, nullable: true })
  attestedRound: number | undefined = undefined;

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
