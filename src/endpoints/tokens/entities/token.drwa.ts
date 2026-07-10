import { ApiProperty } from "@nestjs/swagger";

export class TokenDrwa {
  constructor(init?: Partial<TokenDrwa>) {
    Object.assign(this, init);
  }

  @ApiProperty({ type: Boolean, nullable: true })
  regulated: boolean | undefined = undefined;

  @ApiProperty({ type: Number, nullable: true })
  tokenPolicyVersion: number | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  globalPause: boolean | undefined = undefined;

  @ApiProperty({ type: Boolean, nullable: true })
  strictAuditorMode: boolean | undefined = undefined;
}
