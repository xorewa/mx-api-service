import { Test } from '@nestjs/testing';
import { Address } from '@multiversx/sdk-core';
import { ApiService } from '@multiversx/sdk-nestjs-http';
import { generateKeyPairSync, sign } from 'crypto';
import { ApiConfigService } from 'src/common/api-config/api.config.service';
import { GatewayService } from 'src/common/gateway/gateway.service';
import { DrwaGovernanceService } from 'src/endpoints/drwa/drwa.governance.service';
import { VmQueryService } from 'src/endpoints/vm.query/vm.query.service';

const registryEnvironmentKeys = [
  'DRWA_GOVERNANCE_REGISTRY_BASE64',
  'DRWA_GOVERNANCE_REGISTRY_SIGNATURE_BASE64',
  'DRWA_GOVERNANCE_REGISTRY_PUBLIC_KEY',
] as const;

const safeAddress = new Address(Buffer.alloc(32, 1)).toBech32();
const authAdminAddress = new Address(Buffer.alloc(32, 2)).toBech32();
const proposerAddress = new Address(Buffer.alloc(32, 3)).toBech32();
const secondSignerAddress = new Address(Buffer.alloc(32, 4)).toBech32();
const thirdSignerAddress = new Address(Buffer.alloc(32, 5)).toBech32();

const uint = (value: number, bytes: number): Buffer => {
  const output = Buffer.alloc(bytes);
  let remaining = BigInt(value);
  for (let index = bytes - 1; index >= 0; index -= 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
};

const registry = (expiresAt: string) => ({
  version: 1,
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt,
  scopes: [
    {
      network: 'local-devnet',
      projectId: 'project-1',
      issuerId: 'issuer-1',
      safeAddress,
      authAdminAddress,
      authAdminCodeHash: 'expected-code-hash',
      authAdminStorageVersion: 3,
      authAdminQuorum: 3,
    },
  ],
});

const proposalEvent = () => ({
  _source: {
    txHash: 'proposal-transaction',
    eventType: 'drwaAuthActionProposed',
    emitter: authAdminAddress,
    topics: [
      uint(1, 1).toString('hex'),
      new Address(proposerAddress).getPublicKey().toString('hex'),
      Buffer.from('add_signer').toString('hex'),
    ],
    data: Buffer.concat([uint(5, 8), uint(100, 8), uint(86400, 8)]).toString(
      'hex',
    ),
    blockRound: 5,
    isFinalized: true,
    timestamp: 1700000000,
    eventOrder: 0,
  },
});

const signedEvent = (
  signer: string,
  approvals: number,
  eventOrder: number,
) => ({
  _source: {
    txHash: `sign-transaction-${approvals}`,
    eventType: 'drwaAuthActionSigned',
    emitter: authAdminAddress,
    topics: [
      uint(1, 1).toString('hex'),
      new Address(signer).getPublicKey().toString('hex'),
    ],
    data: Buffer.concat([uint(approvals, 4), uint(3, 4)]).toString('hex'),
    blockRound: 5,
    isFinalized: true,
    timestamp: 1700000000,
    eventOrder,
  },
});

describe('DrwaGovernanceService', () => {
  let service: DrwaGovernanceService;
  let apiService: ApiService;
  let gatewayService: GatewayService;
  let vmQueryService: VmQueryService;
  const originalEnvironment = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const key of registryEnvironmentKeys) {
      originalEnvironment.set(key, process.env[key]);
    }
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DrwaGovernanceService,
        {
          provide: ApiConfigService,
          useValue: {
            getNetwork: jest.fn().mockReturnValue('local-devnet'),
            getElasticUrl: jest.fn().mockReturnValue('http://elastic'),
          },
        },
        { provide: ApiService, useValue: { post: jest.fn() } },
        {
          provide: GatewayService,
          useValue: { getAddressDetails: jest.fn() },
        },
        { provide: VmQueryService, useValue: { vmQuery: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get<DrwaGovernanceService>(DrwaGovernanceService);
    apiService = moduleRef.get<ApiService>(ApiService);
    gatewayService = moduleRef.get<GatewayService>(GatewayService);
    vmQueryService = moduleRef.get<VmQueryService>(VmQueryService);

    jest.spyOn(gatewayService, 'getAddressDetails').mockResolvedValue({
      account: { codeHash: 'expected-code-hash' },
    } as never);
    jest
      .spyOn(vmQueryService, 'vmQuery')
      .mockImplementation((_address, functionName) => {
        const values: Record<string, number> = {
          getStorageVersion: 3,
          getQuorum: 3,
          getNextActionId: 2,
        };
        return Promise.resolve([uint(values[functionName], 1).toString('base64')]);
      });
    jest.spyOn(apiService, 'post').mockResolvedValue({
      data: { hits: { hits: [proposalEvent()] } },
    } as never);
  });

  afterEach(() => {
    for (const key of registryEnvironmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    jest.restoreAllMocks();
  });

  it('returns only a fully reconciled and finalized projection', async () => {
    setSignedRegistry(registry('2030-01-01T00:00:00.000Z'));

    const response = await service.getProposals(safeAddress);

    expect(response.source).toBe('indexed_projection');
    expect(response.finality).toBe('finalized');
    expect(response.stale).toBe(false);
    expect(response.scope?.safeAddress).toBe(safeAddress);
    expect(response.data).toEqual([
      expect.objectContaining({
        proposalId: 1,
        action: 'add_signer',
        proposer: proposerAddress,
        signatures: [proposerAddress],
        quorum: 3,
        timelockSeconds: 86400,
        finality: 'finalized',
      }),
    ]);
    expect(apiService.post).toHaveBeenCalledWith(
      'http://elastic/drwa-control-events/_search',
      expect.objectContaining({
        query: expect.objectContaining({
          bool: expect.objectContaining({
            filter: expect.arrayContaining([
              { term: { isFinalized: true } },
              { term: { emitter: authAdminAddress } },
            ]),
          }),
        }),
      }),
    );
  });

  it('fails closed when the finalized projection has a missing action', async () => {
    setSignedRegistry(registry('2030-01-01T00:00:00.000Z'));
    jest
      .spyOn(vmQueryService, 'vmQuery')
      .mockImplementation((_address, functionName) => {
        const values: Record<string, number> = {
          getStorageVersion: 3,
          getQuorum: 3,
          getNextActionId: 3,
        };
        return Promise.resolve([uint(values[functionName], 1).toString('base64')]);
      });

    const response = await service.getProposals(safeAddress);

    expect(response).toMatchObject({
      data: [],
      source: 'degraded',
      finality: 'pending',
      stale: true,
    });
  });

  it('derives execution time only after finalized quorum evidence', async () => {
    setSignedRegistry(registry('2030-01-01T00:00:00.000Z'));
    jest.spyOn(apiService, 'post').mockResolvedValue({
      data: {
        hits: {
          hits: [
            proposalEvent(),
            signedEvent(secondSignerAddress, 2, 1),
            signedEvent(thirdSignerAddress, 3, 2),
          ],
        },
      },
    } as never);
    jest
      .spyOn(vmQueryService, 'vmQuery')
      .mockImplementation((_address, functionName) => {
        const values: Record<string, number> = {
          getStorageVersion: 3,
          getQuorum: 3,
          getNextActionId: 2,
          getActionApprovedAtTimestampSeconds: 1001,
        };
        return Promise.resolve([uint(values[functionName], 2).toString('base64')]);
      });

    const response = await service.getProposals(safeAddress);

    expect(response.stale).toBe(false);
    expect(response.data[0].executableAt).toBe('1970-01-02T00:16:40.000Z');
    expect(vmQueryService.vmQuery).toHaveBeenCalledWith(
      authAdminAddress,
      'getActionApprovedAtTimestampSeconds',
      undefined,
      ['01'],
      undefined,
      true,
    );
  });

  it('fails closed for an expired registry before using chain data', async () => {
    setSignedRegistry(registry('2020-01-01T00:00:00.000Z'));

    const response = await service.getProposals(safeAddress);

    expect(response.stale).toBe(true);
    expect(response.source).toBe('degraded');
    expect(gatewayService.getAddressDetails).not.toHaveBeenCalled();
  });

  it('fails closed when the deployed auth-admin code hash differs', async () => {
    setSignedRegistry(registry('2030-01-01T00:00:00.000Z'));
    jest
      .spyOn(gatewayService, 'getAddressDetails')
      .mockResolvedValue({ account: { codeHash: 'other-code-hash' } } as never);

    const response = await service.getProposals(safeAddress);

    expect(response.stale).toBe(true);
    expect(response.source).toBe('degraded');
    expect(apiService.post).not.toHaveBeenCalled();
  });

  it('fails closed when an indexed event contains malformed hex', async () => {
    setSignedRegistry(registry('2030-01-01T00:00:00.000Z'));
    const event = proposalEvent();
    event._source.topics[2] = 'abc';
    jest.spyOn(apiService, 'post').mockResolvedValue({
      data: { hits: { hits: [event] } },
    } as never);

    const response = await service.getProposals(safeAddress);

    expect(response.stale).toBe(true);
    expect(response.source).toBe('degraded');
  });
});

function setSignedRegistry(document: ReturnType<typeof registry>): void {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const bytes = Buffer.from(JSON.stringify(document));
  process.env.DRWA_GOVERNANCE_REGISTRY_BASE64 = bytes.toString('base64');
  process.env.DRWA_GOVERNANCE_REGISTRY_SIGNATURE_BASE64 = sign(
    null,
    bytes,
    privateKey,
  ).toString('base64');
  process.env.DRWA_GOVERNANCE_REGISTRY_PUBLIC_KEY = publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString();
}
