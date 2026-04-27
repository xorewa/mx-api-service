export class DrwaDenialFilter {
  constructor(init?: Partial<DrwaDenialFilter>) {
    Object.assign(this, init);
  }

  tokenId?: string;
  address?: string;
  denialCode?: string;
}
