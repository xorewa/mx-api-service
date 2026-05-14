import { Injectable } from '@nestjs/common';
import { AddressUtils } from '@multiversx/sdk-nestjs-common';
import { ApiService } from '@multiversx/sdk-nestjs-http';
import { ApiConfigService } from 'src/common/api-config/api.config.service';
import { QueryPagination } from 'src/common/entities/query.pagination';
import { GatewayService } from 'src/common/gateway/gateway.service';
import { GatewayComponentRequest } from 'src/common/gateway/entities/gateway.component.request';
import { DrwaTokenPolicy, DrwaTokenPolicyHistoryEntry } from './entities/drwa.token.policy';
import { DrwaHolderCompliance } from './entities/drwa.holder.compliance';
import { DrwaDenial } from './entities/drwa.denial';
import { DrwaAttestation } from './entities/drwa.attestation';
import { DrwaDenialFilter } from './entities/drwa.denial.filter';
import { DrwaAssetRecord } from './entities/drwa.asset.record';
import { DrwaIdentityRecord } from './entities/drwa.identity.record';

@Injectable()
export class DrwaService {
  private readonly systemAccountAddress = 'erd1lllllllllllllllllllllllllllllllllllllllllllllllllllsckry7t';
  private readonly tokensIndex = 'tokens';
  private readonly identitiesIndex = 'drwa-identities';
  private readonly holderComplianceIndex = 'drwa-holder-compliance';
  private readonly denialsIndex = 'drwa-denials';
  private readonly attestationsIndex = 'drwa-attestations';
  private readonly tokenPoliciesIndex = 'drwa-token-policies';

  constructor(
    private readonly apiConfigService: ApiConfigService,
    private readonly apiService: ApiService,
    private readonly gatewayService: GatewayService,
  ) { }

  async getDrwaTokenPolicy(identifier: string): Promise<DrwaTokenPolicy | undefined> {
    const gatewayPolicy = await this.getTokenPolicyFromGateway(identifier);
    if (gatewayPolicy) {
      gatewayPolicy.history = await this.getDrwaTokenPolicyHistory(identifier);
      return gatewayPolicy;
    }

    const url = `${this.apiConfigService.getElasticUrl()}/${this.tokensIndex}/_search`;
    const body = {
      size: 1,
      query: {
        bool: {
          filter: [
            this.buildExactFieldFilter('identifier', identifier),
          ],
        },
      },
    };

    const { data } = await this.apiService.post(url, body);
    const hit = data?.hits?.hits?.[0];
    if (!hit) {
      return undefined;
    }

    const drwa = hit._source?.drwa;
    if (!drwa || drwa.regulated !== true) {
      return undefined;
    }

    return new DrwaTokenPolicy({
      tokenId: identifier,
      identifier,
      drwaEnabled: drwa.regulated,
      regulated: drwa.regulated,
      policyId: drwa.policyId,
      tokenPolicyVersion: drwa.tokenPolicyVersion,
      globalPause: drwa.globalPause,
      strictAuditorMode: drwa.strictAuditorMode,
      history: await this.getDrwaTokenPolicyHistory(identifier),
    });
  }

  async getDrwaHolderCompliance(address: string, tokenId?: string): Promise<DrwaHolderCompliance | undefined> {
    if (tokenId) {
      const mirrorState = await this.getHolderComplianceFromGateway(address, tokenId);
      if (mirrorState) {
        if (mirrorState.auditorAuthorized === undefined) {
          mirrorState.auditorAuthorized = await this.getLatestIndexedAuditorAuthorization(address, tokenId);
        }
        return mirrorState;
      }
    }

    const indexedState = await this.getIndexedHolderCompliance(address, tokenId);
    if (indexedState?.holder && indexedState.tokenId) {
      const auditorAuthorized = await this.getLatestIndexedAuditorAuthorization(indexedState.holder, indexedState.tokenId);
      if (auditorAuthorized !== undefined) {
        indexedState.auditorAuthorized = auditorAuthorized;
      }
    }
    return indexedState;
  }

  async getDrwaIdentity(address: string): Promise<DrwaIdentityRecord[]> {
    const url = `${this.apiConfigService.getElasticUrl()}/${this.identitiesIndex}/_search`;
    const body = {
      size: 100,
      sort: [{ timestamp: { order: 'desc' } }],
      query: {
        bool: {
          filter: [
            this.buildExactFieldFilter('subject', address),
            this.buildFinalizedFilter(),
          ],
        },
      },
    };

    const { data } = await this.apiService.post(url, body);
    const hits = data?.hits?.hits ?? [];
    return hits.map((hit: any) => this.mapIdentityRecord({ _id: hit._id, ...hit._source }));
  }

  async getDrwaAsset(identifier: string): Promise<DrwaAssetRecord | undefined> {
    const gatewayAsset = await this.getAssetRecordFromGateway(identifier);
    if (gatewayAsset) {
      if (gatewayAsset.policyId !== undefined && gatewayAsset.regulated !== undefined) {
        return gatewayAsset;
      }

      const policy = await this.getDrwaTokenPolicy(identifier);
      if (!policy) {
        return gatewayAsset;
      }

      return new DrwaAssetRecord({
        ...gatewayAsset,
        policyId: gatewayAsset.policyId ?? policy.policyId,
        regulated: gatewayAsset.regulated ?? policy.regulated,
        windDownInitiated: gatewayAsset.windDownInitiated ?? policy.windDownInitiated ?? false,
      });
    }

    const policy = await this.getDrwaTokenPolicy(identifier);
    if (!policy) {
      return undefined;
    }

    return new DrwaAssetRecord({
      tokenId: identifier,
      identifier,
      policyId: policy.policyId,
      regulated: policy.regulated,
      windDownInitiated: policy.windDownInitiated ?? false,
    });
  }

  async listDrwaAssets(): Promise<DrwaAssetRecord[]> {
    const url = `${this.apiConfigService.getElasticUrl()}/${this.tokensIndex}/_search`;
    const body = {
      size: 1000,
      sort: [{ identifier: { order: 'asc' } }],
      query: {
        bool: {
          filter: [
            { term: { 'drwa.regulated': true } },
          ],
        },
      },
      _source: ['identifier', 'drwa'],
    };

    const { data } = await this.apiService.post(url, body);
    const hits = data?.hits?.hits ?? [];
    const records = await Promise.all(hits.map(async (hit: any) => {
      const identifier = hit?._source?.identifier;
      if (!identifier) {
        return undefined;
      }

      const gatewayAsset = await this.getAssetRecordFromGateway(identifier);
      if (gatewayAsset) {
        return gatewayAsset;
      }

      return new DrwaAssetRecord({
        tokenId: identifier,
        identifier,
        policyId: hit?._source?.drwa?.policyId,
        regulated: hit?._source?.drwa?.regulated === true,
        windDownInitiated: hit?._source?.drwa?.windDownInitiated === true,
      });
    }));

    return records.filter((record): record is DrwaAssetRecord => Boolean(record));
  }

  async getDrwaDenials(filter: DrwaDenialFilter, pagination: QueryPagination): Promise<DrwaDenial[]> {
    const url = `${this.apiConfigService.getElasticUrl()}/${this.denialsIndex}/_search`;
    const { data } = await this.apiService.post(url, this.buildDenialsSearchBody(filter, pagination));
    const hits = data?.hits?.hits ?? [];
    return hits.map((hit: any) => this.mapDenial({ _id: hit._id, ...hit._source }));
  }

  async getDrwaAttestations(tokenId: string, pagination: QueryPagination): Promise<DrwaAttestation[]> {
    const url = `${this.apiConfigService.getElasticUrl()}/${this.attestationsIndex}/_search`;
    const body = {
      from: pagination.from,
      size: pagination.size,
      sort: [{ timestamp: { order: 'desc' } }],
      query: {
        bool: {
          filter: [
            this.buildExactFieldFilter('tokenId', tokenId),
            this.buildFinalizedFilter(),
          ],
        },
      },
    };

    const { data } = await this.apiService.post(url, body);
    const hits = data?.hits?.hits ?? [];
    return hits.map((hit: any) => this.mapAttestation({ _id: hit._id, ...hit._source }));
  }

  private async getDrwaTokenPolicyHistory(identifier: string): Promise<DrwaTokenPolicyHistoryEntry[]> {
    const url = `${this.apiConfigService.getElasticUrl()}/${this.tokenPoliciesIndex}/_search`;
    const body = {
      size: 100,
      sort: [
        { tokenPolicyVersion: { order: 'desc' } },
        { timestamp: { order: 'desc' } },
      ],
      query: {
        bool: {
          filter: [
            this.buildExactFieldFilter('tokenId', identifier),
            this.buildFinalizedFilter(),
          ],
        },
      },
    };

    const { data } = await this.apiService.post(url, body);
    const hits = data?.hits?.hits ?? [];
    return hits.map((hit: any) => new DrwaTokenPolicyHistoryEntry({
      tokenId: identifier,
      identifier,
      eventType: hit._source?.eventType,
      action: hit._source?.eventType,
      policyId: hit._source?.policyId,
      regulated: hit._source?.regulated,
      globalPause: hit._source?.globalPause,
      strictAuditorMode: hit._source?.strictAuditorMode,
      whitePaperCid: hit._source?.whitePaperCid,
      registrationStatus: hit._source?.registrationStatus,
      windDownInitiated: hit._source?.windDownInitiated,
      tokenPolicyVersion: hit._source?.tokenPolicyVersion,
      blockHash: hit._source?.blockHash,
      blockRound: hit._source?.blockRound,
      isFinalized: hit._source?.isFinalized,
      shardId: hit._source?.shardID ?? hit._source?.shardId,
      eventOrder: hit._source?.eventOrder,
      timestamp: hit._source?.timestamp,
    }));
  }

  private async getIndexedHolderCompliance(address: string, tokenId?: string): Promise<DrwaHolderCompliance | undefined> {
    const filters = [this.buildExactFieldFilter('holder', address), this.buildFinalizedFilter()];
    if (tokenId) {
      filters.push(this.buildExactFieldFilter('tokenId', tokenId));
    }

    const url = `${this.apiConfigService.getElasticUrl()}/${this.holderComplianceIndex}/_search`;
    const body = {
      size: 1,
      sort: [{ timestamp: { order: 'desc' } }],
      query: {
        bool: {
          filter: filters,
        },
      },
    };

    const { data } = await this.apiService.post(url, body);
    const hit = data?.hits?.hits?.[0];
    if (!hit) {
      return undefined;
    }

    const src = { _id: hit._id, ...hit._source };
    return new DrwaHolderCompliance({
      tokenId: src.tokenId,
      holder: src.holder,
      holderPolicyVersion: src.holderPolicyVersion,
      kycStatus: src.kycStatus,
      amlStatus: src.amlStatus,
      investorClass: src.investorClass,
      jurisdictionCode: src.jurisdictionCode,
      transferLocked: src.transferLocked,
      receiveLocked: src.receiveLocked,
      auditorAuthorized: src.auditorAuthorized === true ? true : undefined,
      expiryRound: src.expiryRound,
      blockHash: src.blockHash,
      blockRound: src.blockRound,
      isFinalized: src.isFinalized,
      shardId: src.shardID ?? src.shardId,
      eventOrder: src.eventOrder,
    });
  }

  private async getLatestIndexedAuditorAuthorization(address: string, tokenId: string): Promise<boolean | undefined> {
    const url = `${this.apiConfigService.getElasticUrl()}/${this.attestationsIndex}/_search`;
    const body = {
      size: 1,
      sort: [
        { timestamp: { order: 'desc' } },
        { eventOrder: { order: 'desc' } },
      ],
      query: {
        bool: {
          filter: [
            this.buildExactFieldFilter('tokenId', tokenId),
            this.buildExactFieldFilter('subject', address),
            this.buildExactFieldFilter('eventType', 'drwaAttestationRecorded'),
            this.buildFinalizedFilter(),
          ],
        },
      },
    };

    const { data } = await this.apiService.post(url, body);
    const hit = data?.hits?.hits?.[0];
    if (!hit) {
      return undefined;
    }

    const approved = hit._source?.approved;
    return typeof approved === 'boolean' ? approved : undefined;
  }

  private buildDenialsSearchBody(filter: DrwaDenialFilter, pagination: QueryPagination): any {
    return {
      from: pagination.from,
      size: pagination.size,
      sort: [{ timestamp: { order: 'desc' } }],
      query: this.buildDenialsBoolQuery(filter),
    };
  }

  private buildDenialsBoolQuery(filter: DrwaDenialFilter): any {
    const filters: any[] = [this.buildFinalizedFilter()];

    if (filter.tokenId) {
      filters.push(this.buildExactFieldFilter('tokenId', filter.tokenId));
    }

    if (filter.denialCode) {
      filters.push(this.buildExactFieldFilter('denialCode', filter.denialCode));
    }

    if (filter.address) {
      filters.push({
        bool: {
          should: [
            this.buildExactFieldFilter('sender', filter.address),
            this.buildExactFieldFilter('receiver', filter.address),
          ],
          minimum_should_match: 1,
        },
      });
    }

    return filters.length > 0 ? { bool: { filter: filters } } : { match_all: {} };
  }

  private mapDenial(document: any): DrwaDenial {
    return new DrwaDenial({
      txHash: document.txHash,
      tokenId: document.tokenId,
      sender: document.sender,
      receiver: document.receiver,
      denialCode: document.denialCode,
      blockHash: document.blockHash,
      blockRound: document.blockRound,
      isFinalized: document.isFinalized,
      shardId: document.shardID ?? document.shardId,
      eventOrder: document.eventOrder,
      timestamp: document.timestamp,
    });
  }

  private mapAttestation(document: any): DrwaAttestation {
    return new DrwaAttestation({
      txHash: document.txHash,
      tokenId: document.tokenId,
      subject: document.subject,
      auditor: document.auditor,
      eventType: document.eventType,
      attestationType: document.attestationType,
      approved: document.approved,
      attestedRound: document.attestedRound,
      blockHash: document.blockHash,
      blockRound: document.blockRound,
      isFinalized: document.isFinalized,
      shardId: document.shardID ?? document.shardId,
      eventOrder: document.eventOrder,
      timestamp: document.timestamp,
    });
  }

  private mapIdentityRecord(document: any): DrwaIdentityRecord {
    return new DrwaIdentityRecord({
      address: document.subject ?? document.holder,
      tokenId: document.tokenId,
      eventType: document.eventType,
      legalName: document.legalName,
      jurisdictionCode: document.jurisdictionCode,
      registrationNumber: document.registrationNumber,
      entityType: document.entityType,
      kycStatus: document.kycStatus,
      amlStatus: document.amlStatus,
      investorClass: document.investorClass,
      expiryRound: document.expiryRound,
      blockHash: document.blockHash,
      blockRound: document.blockRound,
      isFinalized: document.isFinalized,
      shardId: document.shardID ?? document.shardId,
      eventOrder: document.eventOrder,
      timestamp: document.timestamp,
    });
  }

  private buildExactFieldFilter(field: string, value: string): any {
    return {
      bool: {
        should: [
          { term: { [`${field}.keyword`]: value } },
          { term: { [field]: value } },
          { match_phrase: { [field]: value } },
        ],
        minimum_should_match: 1,
      },
    };
  }

  private buildFinalizedFilter(): any {
    return {
      term: { isFinalized: true },
    };
  }

  private async getHolderComplianceFromGateway(address: string, tokenId: string): Promise<DrwaHolderCompliance | undefined> {
    const stored = await this.getStoredGatewayValue(address, this.buildHolderMirrorStorageKey(address, tokenId));
    if (!stored) {
      return undefined;
    }

    const decoded = this.decodeHolderMirrorBody(stored.body);
    // ISSUE-042 follow-up: decodeHolderMirrorBody returns {} for both an
    // empty stored body AND a malformed binary body. Either case means
    // "no usable compliance data on the gateway path" — synthesizing a
    // DrwaHolderCompliance object with mostly-undefined fields would make
    // this function return truthy and short-circuit the indexed-state
    // fallback in getDrwaHolderCompliance (line 78). Return undefined so
    // the caller cascades to indexed state.
    if (this.isEmptyHolderMirrorDecode(decoded)) {
      return undefined;
    }
    const auditorAuthorized = await this.getHolderAuditorAuthorizationFromGateway(address, tokenId);
    return new DrwaHolderCompliance({
      tokenId,
      holder: address,
      holderPolicyVersion: decoded.holderPolicyVersion ?? stored.version,
      kycStatus: decoded.kycStatus,
      amlStatus: decoded.amlStatus,
      investorClass: decoded.investorClass,
      jurisdictionCode: decoded.jurisdictionCode,
      transferLocked: decoded.transferLocked,
      receiveLocked: decoded.receiveLocked,
      auditorAuthorized,
      expiryRound: decoded.expiryRound,
      shardId: undefined,
      eventOrder: undefined,
    });
  }

  // ISSUE-042 follow-up: a holder-mirror decode is "empty" when none of
  // the substantive compliance fields parsed out. holderPolicyVersion is
  // intentionally NOT in this check because it has a fallback to
  // stored.version above; an entry with only a version stored is still
  // not real compliance data and should fall back to the indexed path.
  private isEmptyHolderMirrorDecode(decoded: Partial<DrwaHolderCompliance>): boolean {
    return decoded.kycStatus === undefined
      && decoded.amlStatus === undefined
      && decoded.investorClass === undefined
      && decoded.jurisdictionCode === undefined
      && decoded.expiryRound === undefined
      && decoded.transferLocked === undefined
      && decoded.receiveLocked === undefined;
  }

  private async getHolderAuditorAuthorizationFromGateway(address: string, tokenId: string): Promise<boolean | undefined> {
    const stored = await this.getStoredGatewayValue(address, this.buildHolderAuditorAuthorizationStorageKey(address, tokenId));
    if (!stored) {
      return undefined;
    }

    return this.decodeHolderAuditorAuthorizationBody(stored.body);
  }

  private async getTokenPolicyFromGateway(identifier: string): Promise<DrwaTokenPolicy | undefined> {
    const stored = await this.getStoredGatewayValue(this.systemAccountAddress, this.buildTokenPolicyStorageKey(identifier));
    if (!stored) {
      return undefined;
    }

    const decoded = this.decodeTokenPolicyBody(stored.body);
    if (!decoded || decoded.drwaEnabled !== true) {
      return undefined;
    }

    return new DrwaTokenPolicy({
      tokenId: identifier,
      identifier,
      regulated: true,
      drwaEnabled: decoded.drwaEnabled,
      policyId: decoded.policyId,
      tokenPolicyVersion: decoded.tokenPolicyVersion ?? stored.version,
      globalPause: decoded.globalPause,
      strictAuditorMode: decoded.strictAuditorMode,
      metadataProtectionEnabled: decoded.metadataProtectionEnabled,
      allowedInvestorClasses: decoded.allowedInvestorClasses,
      allowedJurisdictions: decoded.allowedJurisdictions,
      whitePaperCid: decoded.whitePaperCid,
      registrationStatus: decoded.registrationStatus,
      windDownInitiated: decoded.windDownInitiated,
    });
  }

  private async getAssetRecordFromGateway(identifier: string): Promise<DrwaAssetRecord | undefined> {
    const stored = await this.getStoredGatewayValue(this.systemAccountAddress, this.buildAssetRecordStorageKey(identifier));
    if (!stored) {
      return undefined;
    }

    const decoded = this.decodeAssetRecordBody(identifier, stored.body);
    if (!decoded) {
      return undefined;
    }

    return new DrwaAssetRecord({
      tokenId: identifier,
      identifier,
      carrierType: decoded.carrierType,
      assetClass: decoded.assetClass,
      policyId: decoded.policyId,
      regulated: decoded.regulated,
      windDownInitiated: decoded.windDownInitiated,
      windDownRound: decoded.windDownRound,
      registeredRound: decoded.registeredRound,
    });
  }

  private buildHolderMirrorStorageKey(address: string, tokenId: string): string {
    const tokenHex = Buffer.from(tokenId, 'utf8').toString('hex');
    const addressHex = AddressUtils.bech32Decode(address);
    return `drwa:holder:${tokenHex}:${addressHex}`;
  }

  private buildHolderAuditorAuthorizationStorageKey(address: string, tokenId: string): string {
    const tokenHex = Buffer.from(tokenId, 'utf8').toString('hex');
    const addressHex = AddressUtils.bech32Decode(address);
    return `drwa:auditor:${tokenHex}:${addressHex}`;
  }

  private buildTokenPolicyStorageKey(tokenId: string): string {
    const tokenHex = Buffer.from(tokenId, 'utf8').toString('hex');
    return `drwa:policy:${tokenHex}:policy`;
  }

  private buildAssetRecordStorageKey(tokenId: string): string {
    const tokenHex = Buffer.from(tokenId, 'utf8').toString('hex');
    return `drwa:asset:${tokenHex}:record`;
  }

  private async getStoredGatewayValue(address: string, storageKey: string): Promise<{ version: number; body: Buffer } | undefined> {
    const key = encodeURIComponent(storageKey);
    // eslint-disable-next-line require-await
    const result = await this.gatewayService.get(`address/${address}/key/${key}`, GatewayComponentRequest.addressStorage, async (error) => {
      const message = error?.response?.data?.error;
      if (message?.includes('get value for key error') || message?.includes('account was not found')) {
        return true;
      }

      return false;
    });

    const value = this.extractGatewayStorageValue(result);
    if (!value) {
      return undefined;
    }

    return this.tryParseStoredValue(value);
  }

  private extractGatewayStorageValue(result: any): string | undefined {
    return result?.value
      ?? result?.pair?.value
      ?? result?.data?.value
      ?? result?.keyValuePair?.value;
  }

  private tryParseStoredValue(rawValue: string): { version: number; body: Buffer } | undefined {
    const decoded = this.decodeStorageString(rawValue);
    if (!decoded) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(decoded.toString('utf8'));
      if (typeof parsed?.version !== 'number' || typeof parsed?.body !== 'string') {
        return undefined;
      }

      return {
        version: parsed.version,
        body: Buffer.from(parsed.body, 'base64'),
      };
    } catch {
      return undefined;
    }
  }

  private decodeStorageString(rawValue: string): Buffer | undefined {
    const candidate = rawValue.trim();
    if (!candidate) {
      return undefined;
    }

    if (candidate.startsWith('{')) {
      return Buffer.from(candidate, 'utf8');
    }

    try {
      const decoded = Buffer.from(candidate, 'base64');
      const text = decoded.toString('utf8').trim();
      if (text.startsWith('{')) {
        return decoded;
      }
    } catch {
      // ignore and fall through
    }

    return Buffer.from(candidate, 'utf8');
  }

  private decodeHolderMirrorBody(body: Buffer): Partial<DrwaHolderCompliance> {
    if (body.length === 0) {
      return {};
    }

    if (body[0] === 123) {
      // ISSUE-042 follow-up (cgpt validation): wrap JSON.parse in try/catch.
      // The previous fix already handled malformed BINARY bodies (returned {}
      // and the gateway path falls back to indexed state), but a body that
      // STARTS with `{` enters this JSON branch and JSON.parse throws on
      // syntactically broken input. The exception escaped upstream and broke
      // the gateway request path instead of cascading to indexed fallback.
      // Treat malformed JSON the same way: return {} so the caller cascades.
      try {
        const parsed = JSON.parse(body.toString('utf8'));
        return {
          holderPolicyVersion: parsed.holder_policy_version ?? parsed.holderPolicyVersion,
          kycStatus: parsed.kyc_status ?? parsed.kycStatus,
          amlStatus: parsed.aml_status ?? parsed.amlStatus,
          investorClass: parsed.investor_class ?? parsed.investorClass,
          jurisdictionCode: parsed.jurisdiction_code ?? parsed.jurisdictionCode,
          expiryRound: parsed.expiry_round ?? parsed.expiryRound,
          transferLocked: parsed.transfer_locked ?? parsed.transferLocked,
          receiveLocked: parsed.receive_locked ?? parsed.receiveLocked,
          auditorAuthorized: parsed.auditor_authorized ?? parsed.auditorAuthorized,
        };
      } catch {
        return {};
      }
    }

    // ISSUE-042: the binary branch previously trusted the body length —
    // Node's Buffer.read* methods throw RangeError on out-of-bounds
    // fixed-width reads, but `body[offset]` for the 3 boolean bytes
    // returns `undefined` on a short buffer and the `=== 1` comparison
    // silently produces `false`. A truncated mirror value would either
    // 500 the API (RangeError escaping) or return wrong-but-plausible
    // compliance flags. Both are bad for a compliance surface.
    //
    // The fix: validate remaining bytes before every read, and wrap the
    // whole binary decode in a try/catch that degrades to `{}` on any
    // malformed input — same shape the function already returns for the
    // empty-body case at the top. The DRWA endpoint can then surface a
    // controlled "no compliance data" instead of a runtime exception.
    try {
      let offset = 0;
      const requireRemaining = (n: number): void => {
        if (offset + n > body.length) {
          throw new Error('invalid DRWA holder mirror body');
        }
      };

      requireRemaining(8);
      const holderPolicyVersion = Number(body.readBigUInt64BE(offset));
      offset += 8;

      const readField = (): string => {
        requireRemaining(4);
        const length = body.readUInt32BE(offset);
        offset += 4;
        requireRemaining(length);
        const value = body.subarray(offset, offset + length).toString('utf8');
        offset += length;
        return value;
      };

      const kycStatus = readField();
      const amlStatus = readField();
      const investorClass = readField();
      const jurisdictionCode = readField();

      requireRemaining(8);
      const expiryRound = Number(body.readBigUInt64BE(offset));
      offset += 8;

      requireRemaining(3); // three trailing boolean bytes
      const transferLocked = body[offset] === 1;
      offset += 1;
      const receiveLocked = body[offset] === 1;
      offset += 1;
      const auditorAuthorized = body[offset] === 1;

      return {
        holderPolicyVersion,
        kycStatus,
        amlStatus,
        investorClass,
        jurisdictionCode,
        expiryRound,
        transferLocked,
        receiveLocked,
        auditorAuthorized,
      };
    } catch {
      return {};
    }
  }

  private decodeHolderAuditorAuthorizationBody(body: Buffer): boolean | undefined {
    if (body.length === 0) {
      return undefined;
    }

    if (body[0] === 123) {
      const parsed = this.tryParseJsonBody(body);
      if (!parsed) {
        return undefined;
      }
      return parsed.auditor_authorized ?? parsed.auditorAuthorized;
    }

    if (body.length < 9) {
      return undefined;
    }

    const value = body[8];
    if (value !== 0 && value !== 1) {
      return undefined;
    }

    return value === 1;
  }

  private decodeTokenPolicyBody(body: Buffer): Partial<DrwaTokenPolicy> | undefined {
    if (body.length === 0 || body[0] !== 123) {
      return undefined;
    }

    const parsed = this.tryParseJsonBody(body);
    if (!parsed) {
      return undefined;
    }

    return {
      drwaEnabled: parsed.drwa_enabled ?? parsed.drwaEnabled,
      globalPause: parsed.global_pause ?? parsed.globalPause,
      strictAuditorMode: parsed.strict_auditor_mode ?? parsed.strictAuditorMode,
      metadataProtectionEnabled: parsed.metadata_protection_enabled ?? parsed.metadataProtectionEnabled,
      allowedInvestorClasses: this.parseStringCollection(parsed.allowed_investor_classes ?? parsed.allowedInvestorClasses),
      allowedJurisdictions: this.parseStringCollection(parsed.allowed_jurisdictions ?? parsed.allowedJurisdictions),
      tokenPolicyVersion: parsed.token_policy_version ?? parsed.tokenPolicyVersion,
      whitePaperCid: parsed.white_paper_cid ?? parsed.whitePaperCid,
      registrationStatus: parsed.registration_status ?? parsed.registrationStatus,
      windDownInitiated: parsed.wind_down_initiated ?? parsed.windDownInitiated,
      policyId: parsed.policy_id ?? parsed.policyId,
    };
  }

  private decodeAssetRecordBody(tokenId: string, body: Buffer): Partial<DrwaAssetRecord> | undefined {
    if (body.length === 0) {
      return undefined;
    }

    if (body[0] === 123 || body[0] === 1) {
      const payload = body[0] === 1 ? body.subarray(1) : body;
      const parsed = this.tryParseJsonBody(payload);
      if (!parsed) {
        return undefined;
      }

      return {
        tokenId,
        policyId: parsed.policy_id ?? parsed.policyId,
        regulated: parsed.regulated ?? true,
        windDownInitiated: parsed.wind_down_initiated ?? parsed.windDownInitiated,
        windDownRound: parsed.wind_down_round ?? parsed.windDownRound,
        registeredRound: parsed.registered_round ?? parsed.registeredRound,
      };
    }

    if (body[0] === 0) {
      const payload = body.subarray(1).toString('utf8');
      const separator = payload.indexOf(':');
      return {
        tokenId,
        policyId: separator >= 0 ? payload.slice(separator + 1) : undefined,
        regulated: true,
        windDownInitiated: false,
      };
    }

    return undefined;
  }

  private tryParseJsonBody(body: Buffer): Record<string, any> | undefined {
    try {
      const parsed = JSON.parse(body.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return undefined;
      }

      return parsed;
    } catch {
      return undefined;
    }
  }

  private parseStringCollection(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string');
    }

    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .filter(([, enabled]) => enabled === true)
        .map(([entry]) => entry);
    }

    return [];
  }
}
