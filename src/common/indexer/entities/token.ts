import { Collection } from "./collection";
import { TokenData } from "./token.data";

export interface Token extends Collection {
  identifier: string;
  balance: string;
  roles: any;
  data?: TokenData;
  drwa?: {
    regulated?: boolean;
    tokenPolicyVersion?: number;
    globalPause?: boolean;
    strictAuditorMode?: boolean;
  };
}
