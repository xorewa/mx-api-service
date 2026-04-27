import { ApiProperty } from "@nestjs/swagger";

export class TransactionDrwa {
  constructor(init?: Partial<TransactionDrwa>) {
    Object.assign(this, init);
  }

  @ApiProperty({ type: Boolean, nullable: true })
  isDrwa: boolean | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  hasComplianceSignal: boolean | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  denialCode: string | undefined = undefined;

  @ApiProperty({ type: String, nullable: true })
  denialMessage: string | undefined = undefined;
}
