import { ApiProperty } from "@nestjs/swagger";

export class DrwaDenial {
  constructor(init?: Partial<DrwaDenial>) {
    Object.assign(this, init);
  }

  @ApiProperty({ type: String })
  txHash: string = '';

  @ApiProperty({ type: String })
  tokenId: string = '';

  @ApiProperty({ type: String, nullable: true })
  sender: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  receiver: string | undefined = undefined;

  @ApiProperty({ type: String })
  denialCode: string = '';

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
