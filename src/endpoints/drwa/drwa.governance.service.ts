import { Injectable } from '@nestjs/common';
import { Address } from '@multiversx/sdk-core';
import { ApiService } from '@multiversx/sdk-nestjs-http';
import { verify } from 'crypto';
import { ApiConfigService } from 'src/common/api-config/api.config.service';
import { GatewayService } from 'src/common/gateway/gateway.service';
import { VmQueryService } from 'src/endpoints/vm.query/vm.query.service';
import {
  DrwaGovernanceProposal,
  DrwaGovernanceResponse,
  DrwaGovernanceScope,
} from './entities/drwa.governance';

type GovernanceAction = DrwaGovernanceProposal['action'];

interface RegistryScopeDocument {
  network: string;
  projectId: string;
  issuerId: string;
  tokenId?: string;
  safeAddress: string;
  authAdminAddress: string;
  authAdminCodeHash: string;
  authAdminStorageVersion: number;
  authAdminQuorum: number;
}

interface RegistryDocument {
  version: number;
  issuedAt: string;
  expiresAt: string;
  scopes: RegistryScopeDocument[];
}

interface ControlEventDocument {
  txHash: string;
  eventType: string;
  emitter: string;
  topics: string[];
  data?: string;
  blockRound: number;
  isFinalized: boolean;
  timestamp: number;
  eventOrder: number;
}

interface ElasticHit {
  _source?: ControlEventDocument;
}

interface RegistryLoadResult {
  document?: RegistryDocument;
}

const proposalEvent = 'drwaAuthActionProposed';
const signedEvent = 'drwaAuthActionSigned';
const unsignedEvent = 'drwaAuthActionUnsigned';
const discardedEvent = 'drwaAuthActionDiscarded';
const performedEvent = 'drwaAuthActionPerformed';
const authAdminEvents = [
  proposalEvent,
  signedEvent,
  unsignedEvent,
  discardedEvent,
  performedEvent,
];

@Injectable()
export class DrwaGovernanceService {
  private readonly controlEventsIndex = 'drwa-control-events';

  constructor(
    private readonly apiConfigService: ApiConfigService,
    private readonly apiService: ApiService,
    private readonly gatewayService: GatewayService,
    private readonly vmQueryService: VmQueryService,
  ) {}

  async getProposals(
    safeAddress: string | undefined,
  ): Promise<DrwaGovernanceResponse> {
    const asOf = new Date().toISOString();
    if (!safeAddress || !Address.isValid(safeAddress)) {
      return this.degraded(asOf);
    }

    const registry = this.loadRegistry().document;
    if (!registry) {
      return this.degraded(asOf);
    }

    const scope = registry.scopes.find(
      (candidate) => candidate.safeAddress === safeAddress,
    );
    if (!scope || scope.network !== this.apiConfigService.getNetwork()) {
      return this.degraded(asOf);
    }

    const responseScope = new DrwaGovernanceScope({
      ...scope,
      registryVersion: registry.version,
      registryExpiresAt: registry.expiresAt,
    });

    try {
      const reconciliation = await this.reconcileScope(scope);
      if (!reconciliation) {
        return this.degraded(asOf, responseScope);
      }

      const events = await this.getFinalizedEvents(scope.authAdminAddress);
      const proposals = this.materializeProposals(
        events,
        reconciliation.quorum,
      );
      if (
        !this.hasCompleteProposalCoverage(
          proposals,
          reconciliation.nextActionId,
        )
      ) {
        return this.degraded(asOf, responseScope);
      }
      await this.hydrateExecutableAt(scope, proposals);

      return new DrwaGovernanceResponse({
        data: proposals,
        source: 'indexed_projection',
        finality: 'finalized',
        asOf,
        stale: false,
        scope: responseScope,
      });
    } catch {
      return this.degraded(asOf, responseScope);
    }
  }

  private degraded(
    asOf: string,
    scope?: DrwaGovernanceScope,
  ): DrwaGovernanceResponse {
    return new DrwaGovernanceResponse({
      data: [],
      source: 'degraded',
      finality: 'pending',
      asOf,
      stale: true,
      scope,
    });
  }

  private loadRegistry(): RegistryLoadResult {
    const documentBase64 = process.env.DRWA_GOVERNANCE_REGISTRY_BASE64;
    const signatureBase64 =
      process.env.DRWA_GOVERNANCE_REGISTRY_SIGNATURE_BASE64;
    const publicKey = process.env.DRWA_GOVERNANCE_REGISTRY_PUBLIC_KEY;
    if (!documentBase64 || !signatureBase64 || !publicKey) {
      return {};
    }

    try {
      const documentBytes = this.decodeStrictBase64(documentBase64);
      const signature = this.decodeStrictBase64(signatureBase64);
      const normalizedPublicKey = publicKey.replace(/\\n/g, '\n');
      if (!verify(null, documentBytes, normalizedPublicKey, signature)) {
        return {};
      }

      const parsed: unknown = JSON.parse(documentBytes.toString('utf8'));
      const document = this.parseRegistryDocument(parsed);
      if (!document || Date.parse(document.expiresAt) <= Date.now()) {
        return {};
      }

      return { document };
    } catch {
      return {};
    }
  }

  private parseRegistryDocument(value: unknown): RegistryDocument | undefined {
    if (!this.isRecord(value)) {
      return undefined;
    }

    const version = value.version;
    const issuedAt = value.issuedAt;
    const expiresAt = value.expiresAt;
    const scopes = value.scopes;
    if (
      typeof version !== 'number' ||
      !Number.isSafeInteger(version) ||
      version < 1 ||
      typeof issuedAt !== 'string' ||
      !Number.isFinite(Date.parse(issuedAt)) ||
      typeof expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(expiresAt)) ||
      !Array.isArray(scopes)
    ) {
      return undefined;
    }

    const parsedScopes: RegistryScopeDocument[] = [];
    for (const scope of scopes) {
      const parsedScope = this.parseRegistryScope(scope);
      if (!parsedScope) {
        return undefined;
      }
      parsedScopes.push(parsedScope);
    }

    const safeAddresses = new Set(
      parsedScopes.map((scope) => scope.safeAddress),
    );
    if (safeAddresses.size !== parsedScopes.length) {
      return undefined;
    }

    return { version, issuedAt, expiresAt, scopes: parsedScopes };
  }

  private parseRegistryScope(
    value: unknown,
  ): RegistryScopeDocument | undefined {
    if (!this.isRecord(value)) {
      return undefined;
    }

    const network = value.network;
    const projectId = value.projectId;
    const issuerId = value.issuerId;
    const safeAddress = value.safeAddress;
    const authAdminAddress = value.authAdminAddress;
    const authAdminCodeHash = value.authAdminCodeHash;
    const authAdminStorageVersion = value.authAdminStorageVersion;
    const authAdminQuorum = value.authAdminQuorum;
    const tokenId = value.tokenId;
    if (
      typeof network !== 'string' ||
      network.length === 0 ||
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      typeof issuerId !== 'string' ||
      issuerId.length === 0 ||
      typeof safeAddress !== 'string' ||
      safeAddress.length === 0 ||
      typeof authAdminAddress !== 'string' ||
      authAdminAddress.length === 0 ||
      typeof authAdminCodeHash !== 'string' ||
      authAdminCodeHash.length === 0 ||
      !Address.isValid(safeAddress) ||
      !Address.isValid(authAdminAddress)
    ) {
      return undefined;
    }
    if (
      typeof authAdminStorageVersion !== 'number' ||
      !Number.isSafeInteger(authAdminStorageVersion) ||
      authAdminStorageVersion < 1 ||
      typeof authAdminQuorum !== 'number' ||
      !Number.isSafeInteger(authAdminQuorum) ||
      authAdminQuorum < 1
    ) {
      return undefined;
    }
    if (tokenId !== undefined && typeof tokenId !== 'string') {
      return undefined;
    }

    return {
      network,
      projectId,
      issuerId,
      tokenId,
      safeAddress,
      authAdminAddress,
      authAdminCodeHash,
      authAdminStorageVersion,
      authAdminQuorum,
    };
  }

  private async reconcileScope(
    scope: RegistryScopeDocument,
  ): Promise<{ nextActionId: number; quorum: number } | undefined> {
    const account = await this.gatewayService.getAddressDetails(
      scope.authAdminAddress,
    );
    if (account.account.codeHash !== scope.authAdminCodeHash) {
      return undefined;
    }

    const [storageVersionData, quorumData, nextActionIdData] =
      await Promise.all([
        this.vmQueryService.vmQuery(
          scope.authAdminAddress,
          'getStorageVersion',
          undefined,
          [],
          undefined,
          true,
        ),
        this.vmQueryService.vmQuery(
          scope.authAdminAddress,
          'getQuorum',
          undefined,
          [],
          undefined,
          true,
        ),
        this.vmQueryService.vmQuery(
          scope.authAdminAddress,
          'getNextActionId',
          undefined,
          [],
          undefined,
          true,
        ),
      ]);

    const storageVersion = this.decodeSingleUnsignedInteger(storageVersionData);
    const quorum = this.decodeSingleUnsignedInteger(quorumData);
    const nextActionId = this.decodeSingleUnsignedInteger(nextActionIdData);
    if (
      storageVersion !== scope.authAdminStorageVersion ||
      quorum !== scope.authAdminQuorum ||
      nextActionId < 1
    ) {
      return undefined;
    }

    return { nextActionId, quorum };
  }

  private async getFinalizedEvents(
    authAdminAddress: string,
  ): Promise<ControlEventDocument[]> {
    const url = `${this.apiConfigService.getElasticUrl()}/${this.controlEventsIndex}/_search`;
    const body = {
      size: 10000,
      sort: [
        { blockRound: { order: 'asc' } },
        { eventOrder: { order: 'asc' } },
      ],
      query: {
        bool: {
          filter: [
            { term: { isFinalized: true } },
            { term: { emitter: authAdminAddress } },
            { terms: { eventType: authAdminEvents } },
          ],
        },
      },
    };
    const response = await this.apiService.post(url, body);
    const hits = this.extractHits(response);
    const events: ControlEventDocument[] = [];
    for (const hit of hits) {
      const event = this.parseControlEvent(hit._source);
      if (
        !event ||
        !event.isFinalized ||
        event.emitter !== authAdminAddress ||
        !authAdminEvents.includes(event.eventType)
      ) {
        throw new Error('invalid control event projection');
      }
      events.push(event);
    }
    return events;
  }

  private materializeProposals(
    events: ControlEventDocument[],
    currentQuorum: number,
  ): DrwaGovernanceProposal[] {
    const proposals = new Map<number, DrwaGovernanceProposal>();
    for (const event of events) {
      const actionId = this.getActionId(event);
      if (actionId === undefined) {
        throw new Error('invalid action id');
      }

      if (event.eventType === proposalEvent) {
        if (proposals.has(actionId)) {
          throw new Error('duplicate proposal event');
        }
        const proposal = this.parseProposalEvent(
          event,
          actionId,
          currentQuorum,
        );
        proposals.set(actionId, proposal);
        continue;
      }

      const proposal = proposals.get(actionId);
      if (!proposal) {
        throw new Error('proposal lifecycle without proposal');
      }
      this.applyProposalLifecycleEvent(proposal, event);
    }
    return [...proposals.values()].sort(
      (left, right) => left.proposalId - right.proposalId,
    );
  }

  private parseProposalEvent(
    event: ControlEventDocument,
    actionId: number,
    currentQuorum: number,
  ): DrwaGovernanceProposal {
    if (event.topics.length !== 3 || !event.data) {
      throw new Error('invalid proposal event');
    }
    const proposer = this.decodeAddressTopic(event.topics[1]);
    const action = this.parseAction(
      this.decodeStrictHex(event.topics[2]).toString('utf8'),
    );
    const payload = this.decodeStrictHex(event.data);
    if (payload.length !== 24) {
      throw new Error('unexpected proposal payload length');
    }
    const createdRound = this.decodeFixedUnsignedInteger(
      payload.subarray(0, 8),
    );
    const expiryRound = this.decodeFixedUnsignedInteger(
      payload.subarray(8, 16),
    );
    const timelockSeconds = this.decodeFixedUnsignedInteger(
      payload.subarray(16, 24),
    );

    return new DrwaGovernanceProposal({
      proposalId: actionId,
      action,
      proposer,
      signatures: [proposer],
      // The proposal event does not encode a quorum snapshot. This is the
      // reconciled current auth-admin quorum, not a historical claim.
      quorum: currentQuorum,
      state: 'pending',
      creationRound: createdRound,
      expiryRound,
      timelockSeconds,
      creationTxHash: event.txHash,
      finality: 'finalized',
    });
  }

  private applyProposalLifecycleEvent(
    proposal: DrwaGovernanceProposal,
    event: ControlEventDocument,
  ): void {
    if (event.eventType === signedEvent || event.eventType === unsignedEvent) {
      if (event.topics.length !== 2 || !event.data) {
        throw new Error('invalid approval event');
      }
      const signer = this.decodeAddressTopic(event.topics[1]);
      const payload = this.decodeStrictHex(event.data);
      if (payload.length !== 8) {
        throw new Error('unexpected approval payload length');
      }
      const eventQuorum = this.decodeFixedUnsignedInteger(
        payload.subarray(4, 8),
      );
      if (eventQuorum < 1) {
        throw new Error('invalid approval quorum');
      }
      if (event.eventType === signedEvent) {
        if (proposal.signatures.includes(signer)) {
          throw new Error('duplicate signature');
        }
        proposal.signatures.push(signer);
      } else {
        proposal.signatures = proposal.signatures.filter(
          (address) => address !== signer,
        );
      }
      const reportedApprovals = this.decodeFixedUnsignedInteger(
        payload.subarray(0, 4),
      );
      if (reportedApprovals !== proposal.signatures.length) {
        throw new Error('approval count does not match event history');
      }
      return;
    }

    if (event.eventType === discardedEvent) {
      if (
        event.topics.length !== 2 ||
        !event.data ||
        this.decodeStrictHex(event.data).length !== 8
      ) {
        throw new Error('invalid discard event');
      }
      proposal.state = 'discarded';
      return;
    }

    if (event.eventType === performedEvent) {
      if (event.topics.length !== 3) {
        throw new Error('invalid performed event');
      }
      const performedAction = this.parseAction(
        this.decodeStrictHex(event.topics[2]).toString('utf8'),
      );
      if (performedAction !== proposal.action) {
        throw new Error('performed action mismatch');
      }
      proposal.state = 'performed';
      proposal.executionTxHash = event.txHash;
      return;
    }

    throw new Error('unsupported governance lifecycle event');
  }

  private hasCompleteProposalCoverage(
    proposals: DrwaGovernanceProposal[],
    nextActionId: number,
  ): boolean {
    if (proposals.length !== nextActionId - 1) {
      return false;
    }
    return proposals.every(
      (proposal, index) => proposal.proposalId === index + 1,
    );
  }

  private async hydrateExecutableAt(
    scope: RegistryScopeDocument,
    proposals: DrwaGovernanceProposal[],
  ): Promise<void> {
    const awaitingTimelock = proposals.filter(
      (proposal) =>
        proposal.state === 'pending' &&
        proposal.signatures.length >= proposal.quorum,
    );

    await Promise.all(
      awaitingTimelock.map(async (proposal) => {
        if (!proposal.timelockSeconds) {
          throw new Error('pending action has no timelock');
        }
        const returnData = await this.vmQueryService.vmQuery(
          scope.authAdminAddress,
          'getActionApprovedAtTimestampSeconds',
          undefined,
          [this.encodeUnsignedIntegerArgument(proposal.proposalId)],
          undefined,
          true,
        );
        const approvedAtStorage =
          this.decodeOptionalSingleUnsignedInteger(returnData);
        if (approvedAtStorage === undefined || approvedAtStorage < 1) {
          throw new Error('quorum action is missing its approval timestamp');
        }
        const executableAtSeconds =
          approvedAtStorage - 1 + proposal.timelockSeconds;
        const executableAt = new Date(executableAtSeconds * 1000);
        if (Number.isNaN(executableAt.getTime())) {
          throw new Error('invalid action execution timestamp');
        }
        proposal.executableAt = executableAt.toISOString();
      }),
    );
  }

  private getActionId(event: ControlEventDocument): number | undefined {
    if (event.topics.length === 0) {
      return undefined;
    }
    try {
      return this.decodeUnsignedInteger(this.decodeStrictHex(event.topics[0]));
    } catch {
      return undefined;
    }
  }

  private parseAction(value: string): GovernanceAction {
    if (
      value === 'update_caller' ||
      value === 'add_signer' ||
      value === 'remove_signer' ||
      value === 'replace_signer' ||
      value === 'change_quorum'
    ) {
      return value;
    }
    throw new Error('unknown governance action');
  }

  private decodeSingleUnsignedInteger(returnData: string[]): number {
    if (returnData.length !== 1 || typeof returnData[0] !== 'string') {
      throw new Error('invalid vm query response');
    }
    return this.decodeUnsignedInteger(Buffer.from(returnData[0], 'base64'));
  }

  private decodeOptionalSingleUnsignedInteger(
    returnData: string[],
  ): number | undefined {
    if (returnData.length === 0) {
      return undefined;
    }
    return this.decodeSingleUnsignedInteger(returnData);
  }

  private encodeUnsignedIntegerArgument(value: number): string {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('invalid unsigned integer argument');
    }
    const encoded = value.toString(16);
    return encoded.length % 2 === 0 ? encoded : `0${encoded}`;
  }

  private decodeFixedUnsignedInteger(value: Buffer): number {
    return this.decodeUnsignedInteger(value);
  }

  private decodeUnsignedInteger(value: Buffer): number {
    if (value.length === 0 || value.length > 8) {
      throw new Error('invalid unsigned integer');
    }
    let decoded = 0n;
    for (const byte of value) {
      decoded = (decoded << 8n) | BigInt(byte);
    }
    if (decoded > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('unsafe integer');
    }
    return Number(decoded);
  }

  private decodeAddressTopic(value: string): string {
    const bytes = this.decodeStrictHex(value);
    if (bytes.length !== 32) {
      throw new Error('invalid address topic');
    }
    return new Address(bytes).toBech32();
  }

  private extractHits(value: unknown): ElasticHit[] {
    if (
      !this.isRecord(value) ||
      !this.isRecord(value.data) ||
      !this.isRecord(value.data.hits) ||
      !Array.isArray(value.data.hits.hits)
    ) {
      throw new Error('invalid Elasticsearch response');
    }
    return value.data.hits.hits as ElasticHit[];
  }

  private parseControlEvent(value: unknown): ControlEventDocument | undefined {
    if (!this.isRecord(value) || !Array.isArray(value.topics)) {
      return undefined;
    }
    const topics = value.topics;
    if (
      typeof value.txHash !== 'string' ||
      typeof value.eventType !== 'string' ||
      typeof value.emitter !== 'string' ||
      !topics.every((topic) => typeof topic === 'string') ||
      typeof value.blockRound !== 'number' ||
      !Number.isSafeInteger(value.blockRound) ||
      value.blockRound < 0 ||
      typeof value.isFinalized !== 'boolean' ||
      typeof value.timestamp !== 'number' ||
      !Number.isSafeInteger(value.timestamp) ||
      value.timestamp < 0 ||
      typeof value.eventOrder !== 'number' ||
      !Number.isSafeInteger(value.eventOrder) ||
      value.eventOrder < 0 ||
      (value.data !== undefined && typeof value.data !== 'string')
    ) {
      return undefined;
    }
    return {
      txHash: value.txHash,
      eventType: value.eventType,
      emitter: value.emitter,
      topics,
      data: value.data,
      blockRound: value.blockRound,
      isFinalized: value.isFinalized,
      timestamp: value.timestamp,
      eventOrder: value.eventOrder,
    };
  }

  private decodeStrictBase64(value: string): Buffer {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
      throw new Error('invalid base64');
    }
    return Buffer.from(value, 'base64');
  }

  private decodeStrictHex(value: string): Buffer {
    if (!/^[0-9a-fA-F]*$/.test(value) || value.length % 2 !== 0) {
      throw new Error('invalid hex');
    }
    return Buffer.from(value, 'hex');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
