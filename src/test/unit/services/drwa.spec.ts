import { Test } from "@nestjs/testing";
import { AddressUtils } from "@multiversx/sdk-nestjs-common";
import { ApiService } from "@multiversx/sdk-nestjs-http";
import { ApiConfigService } from "src/common/api-config/api.config.service";
import { QueryPagination } from "src/common/entities/query.pagination";
import { GatewayService } from "src/common/gateway/gateway.service";
import { DrwaDenialFilter } from "src/endpoints/drwa/entities/drwa.denial.filter";
import { DrwaService } from "src/endpoints/drwa/drwa.service";

describe('Drwa Service', () => {
  let service: DrwaService;
  let apiService: ApiService;
  let gatewayService: GatewayService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DrwaService,
        {
          provide: ApiConfigService,
          useValue: {
            getElasticUrl: jest.fn().mockReturnValue('http://elastic'),
          },
        },
        {
          provide: ApiService,
          useValue: {
            post: jest.fn(),
          },
        },
        {
          provide: GatewayService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<DrwaService>(DrwaService);
    apiService = moduleRef.get<ApiService>(ApiService);
    gatewayService = moduleRef.get<GatewayService>(GatewayService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return token policy with history', async () => {
    const postSpy = jest.spyOn(apiService, 'post')
      .mockResolvedValueOnce({
        data: {
          hits: {
            hits: [
              {
                _source: {
                  drwa: {
                    regulated: true,
                    policyId: 'policy-1',
                    tokenPolicyVersion: 2,
                    globalPause: false,
                    strictAuditorMode: true,
                  },
                },
              },
            ],
          },
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          hits: {
            hits: [
              {
              _source: {
                eventType: 'drwaWhitePaperCidSet',
                policyId: 'policy-1',
                regulated: true,
                globalPause: false,
                strictAuditorMode: true,
                tokenPolicyVersion: 2,
                whitePaperCid: 'QmTestCidValue1234567890123456789012345678901234',
                registrationStatus: 'approved',
                windDownInitiated: true,
                blockHash: 'abcd1234',
                blockRound: 77,
                isFinalized: true,
                shardID: 1,
                eventOrder: 6,
                timestamp: 1700000000,
              },
            },
            ],
          },
        },
      } as any);

    const result = await service.getDrwaTokenPolicy('HOTEL-1234');

    expect(result?.regulated).toBe(true);
    expect(result?.policyId).toBe('policy-1');
    expect(result?.history?.length).toBe(1);
    expect(result?.history?.[0].tokenPolicyVersion).toBe(2);
    expect(result?.history?.[0].whitePaperCid).toBe('QmTestCidValue1234567890123456789012345678901234');
    expect(result?.history?.[0].registrationStatus).toBe('approved');
    expect(result?.history?.[0].windDownInitiated).toBe(true);
    expect(result?.history?.[0].blockHash).toBe('abcd1234');
    expect(result?.history?.[0].blockRound).toBe(77);
    expect(result?.history?.[0].isFinalized).toBe(true);
    expect(result?.history?.[0].shardId).toBe(1);
    expect(result?.history?.[0].eventOrder).toBe(6);
    expect(postSpy).toHaveBeenNthCalledWith(
      2,
      'http://elastic/drwa-token-policies/_search',
      expect.objectContaining({
        query: {
          bool: {
            filter: expect.arrayContaining([
              expect.objectContaining({
                bool: expect.objectContaining({
                  minimum_should_match: 1,
                }),
              }),
              { term: { isFinalized: true } },
            ]),
          },
        },
      }),
    );
  });

  it('should prefer canonical gateway token policy when present', async () => {
    const stored = Buffer.from(JSON.stringify({
      version: 9,
      body: Buffer.from(JSON.stringify({
        drwa_enabled: true,
        global_pause: false,
        strict_auditor_mode: true,
        metadata_protection_enabled: true,
        allowed_investor_classes: { QIB: true, RETAIL: true },
        allowed_jurisdictions: { US: true, SG: true },
        white_paper_cid: 'QmTestCidValue1234567890123456789012345678901234',
        registration_status: 'approved',
        wind_down_initiated: true,
      })).toString('base64'),
    })).toString('base64');

    jest.spyOn(gatewayService, 'get')
      .mockResolvedValueOnce({ value: stored } as any);
    jest.spyOn(apiService, 'post').mockResolvedValue({
      data: { hits: { hits: [] } },
    } as any);

    const result = await service.getDrwaTokenPolicy('HOTEL-1234');

    expect(result?.identifier).toBe('HOTEL-1234');
    expect(result?.drwaEnabled).toBe(true);
    expect(result?.metadataProtectionEnabled).toBe(true);
    expect(result?.allowedInvestorClasses).toEqual(['QIB', 'RETAIL']);
    expect(result?.allowedJurisdictions).toEqual(['US', 'SG']);
    expect(result?.whitePaperCid).toContain('QmTestCidValue');
    expect(result?.registrationStatus).toBe('approved');
    expect(result?.windDownInitiated).toBe(true);
  });

  it('should decode holder compliance from canonical gateway storage', async () => {
    jest.spyOn(AddressUtils, 'bech32Decode').mockReturnValue('5a5a5a5a' as any);

    const body = Buffer.concat([
      Buffer.from([0, 0, 0, 0, 0, 0, 0, 3]),
      Buffer.from([0, 0, 0, 8]), Buffer.from('approved'),
      Buffer.from([0, 0, 0, 8]), Buffer.from('approved'),
      Buffer.from([0, 0, 0, 3]), Buffer.from('QIB'),
      Buffer.from([0, 0, 0, 2]), Buffer.from('US'),
      Buffer.from([0, 0, 0, 0, 0, 0, 0, 9]),
      Buffer.from([1, 0, 0]),
    ]);
    const stored = Buffer.from(JSON.stringify({
      version: 3,
      body: body.toString('base64'),
    })).toString('base64');
    const auditorStored = Buffer.from(JSON.stringify({
      version: 4,
      body: Buffer.concat([
        Buffer.alloc(8),
        Buffer.from([1]),
      ]).toString('base64'),
    })).toString('base64');

    jest.spyOn(gatewayService, 'get')
      .mockResolvedValueOnce({ value: stored } as any)
      .mockResolvedValueOnce({ value: auditorStored } as any);

    const result = await service.getDrwaHolderCompliance('erd1holder', 'HOTEL-1234');

    expect(gatewayService.get).toHaveBeenNthCalledWith(
      1,
      'address/erd1holder/key/drwa%3Aholder%3A484f54454c2d31323334%3A5a5a5a5a',
      expect.anything(),
      expect.any(Function),
    );
    expect(gatewayService.get).toHaveBeenNthCalledWith(
      2,
      'address/erd1holder/key/drwa%3Aauditor%3A484f54454c2d31323334%3A5a5a5a5a',
      expect.anything(),
      expect.any(Function),
    );
    expect(result?.tokenId).toBe('HOTEL-1234');
    expect(result?.holder).toBe('erd1holder');
    expect(result?.holderPolicyVersion).toBe(3);
    expect(result?.kycStatus).toBe('approved');
    expect(result?.amlStatus).toBe('approved');
    expect(result?.investorClass).toBe('QIB');
    expect(result?.jurisdictionCode).toBe('US');
    expect(result?.expiryRound).toBe(9);
    expect(result?.transferLocked).toBe(true);
    expect(result?.receiveLocked).toBe(false);
    expect(result?.auditorAuthorized).toBe(true);
    expect(apiService.post).not.toHaveBeenCalled();
  });

  it('should not treat holder mirror auditorAuthorized false as attestation truth', async () => {
    jest.spyOn(AddressUtils, 'bech32Decode').mockReturnValue('5a5a5a5a' as any);

    const body = Buffer.concat([
      Buffer.from([0, 0, 0, 0, 0, 0, 0, 3]),
      Buffer.from([0, 0, 0, 8]), Buffer.from('approved'),
      Buffer.from([0, 0, 0, 8]), Buffer.from('approved'),
      Buffer.from([0, 0, 0, 3]), Buffer.from('QIB'),
      Buffer.from([0, 0, 0, 2]), Buffer.from('US'),
      Buffer.from([0, 0, 0, 0, 0, 0, 0, 9]),
      Buffer.from([0, 0, 0]),
    ]);
    const stored = Buffer.from(JSON.stringify({
      version: 3,
      body: body.toString('base64'),
    })).toString('base64');

    jest.spyOn(gatewayService, 'get')
      .mockResolvedValueOnce({ value: stored } as any)
      .mockResolvedValueOnce(undefined as any);
    jest.spyOn(apiService, 'post').mockResolvedValue({
      data: { hits: { hits: [] } },
    } as any);

    const result = await service.getDrwaHolderCompliance('erd1holder', 'HOTEL-1234');

    expect(result?.auditorAuthorized).toBeUndefined();
    expect(apiService.post).toHaveBeenCalledWith(
      'http://elastic/drwa-attestations/_search',
      expect.objectContaining({
        query: {
          bool: {
            filter: expect.arrayContaining([
              expect.objectContaining({
                bool: expect.objectContaining({
                  minimum_should_match: 1,
                }),
              }),
              { term: { isFinalized: true } },
            ]),
          },
        },
      }),
    );
  });

  it('should merge finalized attestation truth over holder-compliance auditor mirror', async () => {
    jest.spyOn(AddressUtils, 'bech32Decode').mockReturnValue('5a5a5a5a' as any);
    jest.spyOn(gatewayService, 'get').mockResolvedValue(undefined as any);
    jest.spyOn(apiService, 'post')
      .mockResolvedValueOnce({
        data: {
          hits: {
            hits: [
              {
                _id: 'holder-1',
                _source: {
                  tokenId: 'HOTEL-1234',
                  holder: 'erd1holder',
                  holderPolicyVersion: 7,
                  kycStatus: 'approved',
                  amlStatus: 'approved',
                  investorClass: 'QIB',
                  jurisdictionCode: 'US',
                  transferLocked: false,
                  receiveLocked: false,
                  auditorAuthorized: false,
                  expiryRound: 12,
                  shardID: 5,
                  eventOrder: 8,
                },
              },
            ],
          },
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          hits: {
            hits: [
              {
                _id: 'att-1',
                _source: {
                  tokenId: 'HOTEL-1234',
                  subject: 'erd1holder',
                  eventType: 'drwaAttestationRecorded',
                  approved: true,
                  isFinalized: true,
                  timestamp: 1700000042,
                  eventOrder: 12,
                },
              },
            ],
          },
        },
      } as any);

    const result = await service.getDrwaHolderCompliance('erd1holder', 'HOTEL-1234');

    expect(result?.auditorAuthorized).toBe(true);
    expect(apiService.post).toHaveBeenNthCalledWith(
      2,
      'http://elastic/drwa-attestations/_search',
      expect.objectContaining({
        sort: [
          { timestamp: { order: 'desc' } },
          { eventOrder: { order: 'desc' } },
        ],
      }),
    );
  });

  it('should fall back to indexed holder compliance when canonical storage is malformed', async () => {
    jest.spyOn(AddressUtils, 'bech32Decode').mockReturnValue('5a5a5a5a' as any);

    jest.spyOn(gatewayService, 'get').mockResolvedValue({ value: 'not-json-or-base64' } as any);
    jest.spyOn(apiService, 'post').mockResolvedValue({
      data: {
        hits: {
          hits: [
            {
              _id: 'holder-1',
              _source: {
                tokenId: 'HOTEL-1234',
                holder: 'erd1holder',
                holderPolicyVersion: 7,
                kycStatus: 'approved',
                amlStatus: 'approved',
                investorClass: 'QIB',
                jurisdictionCode: 'US',
                transferLocked: false,
                receiveLocked: false,
                auditorAuthorized: true,
                expiryRound: 12,
                shardID: 5,
                eventOrder: 8,
              },
            },
          ],
        },
      },
    } as any);

    const result = await service.getDrwaHolderCompliance('erd1holder', 'HOTEL-1234');

    expect(result?.holderPolicyVersion).toBe(7);
    expect(result?.kycStatus).toBe('approved');
    expect(result?.shardId).toBe(5);
    expect(result?.eventOrder).toBe(8);
    expect(apiService.post).toHaveBeenCalledWith(
      'http://elastic/drwa-holder-compliance/_search',
      expect.objectContaining({
        query: {
          bool: {
            filter: expect.arrayContaining([
              expect.objectContaining({
                bool: expect.objectContaining({
                  minimum_should_match: 1,
                }),
              }),
              { term: { isFinalized: true } },
            ]),
          },
        },
      }),
    );
  });

  it('should decode canonical asset record from gateway storage', async () => {
    const stored = Buffer.from(JSON.stringify({
      version: 4,
      body: Buffer.from('\u0000HOTEL-1234:policy-9', 'utf8').toString('base64'),
    })).toString('base64');

    jest.spyOn(gatewayService, 'get').mockResolvedValue({ value: stored } as any);

    const result = await service.getDrwaAsset('HOTEL-1234');

    expect(result?.identifier).toBe('HOTEL-1234');
    expect(result?.policyId).toBe('policy-9');
    expect(result?.regulated).toBe(true);
    expect(result?.windDownInitiated).toBe(false);
  });

  it('should return identity history from the dedicated identity index', async () => {
    jest.spyOn(apiService, 'post').mockResolvedValue({
      data: {
        hits: {
          hits: [
            {
              _id: 'identity-1',
              _source: {
                subject: 'erd1holder',
                eventType: 'drwaIdentityRegistered',
                jurisdictionCode: 'US',
                entityType: 'company',
                blockHash: 'block-identity-1',
                blockRound: 44,
                isFinalized: true,
                shardID: 2,
                eventOrder: 4,
                timestamp: 1700000000,
              },
            },
            {
              _id: 'identity-2',
              _source: {
                subject: 'erd1holder',
                eventType: 'drwaComplianceUpdated',
                kycStatus: 'approved',
                amlStatus: 'approved',
                shardID: 2,
                eventOrder: 5,
                timestamp: 1700000001,
              },
            },
          ],
        },
      },
    } as any);

    const result = await service.getDrwaIdentity('erd1holder');

    expect(apiService.post).toHaveBeenCalledWith(
      'http://elastic/drwa-identities/_search',
      expect.objectContaining({
        query: {
          bool: {
            filter: expect.arrayContaining([
              {
                bool: {
                  minimum_should_match: 1,
                  should: [
                    { term: { 'subject.keyword': 'erd1holder' } },
                    { term: { subject: 'erd1holder' } },
                    { match_phrase: { subject: 'erd1holder' } },
                  ],
                },
              },
              { term: { isFinalized: true } },
            ]),
          },
        },
      }),
    );
    expect(result).toHaveLength(2);
    expect(result[0].address).toBe('erd1holder');
    expect(result[0].eventType).toBe('drwaIdentityRegistered');
    expect(result[0].jurisdictionCode).toBe('US');
    expect(result[0].blockHash).toBe('block-identity-1');
    expect(result[0].blockRound).toBe(44);
    expect(result[0].isFinalized).toBe(true);
    expect(result[0].shardId).toBe(2);
    expect(result[0].eventOrder).toBe(4);
    expect(result[1].eventType).toBe('drwaComplianceUpdated');
    expect(result[1].kycStatus).toBe('approved');
    expect(result[1].amlStatus).toBe('approved');
    expect(result[1].eventOrder).toBe(5);
  });

  it('should preserve attestation history fields from indexed records', async () => {
    jest.spyOn(apiService, 'post').mockResolvedValue({
      data: {
        hits: {
          hits: [
            {
              _id: 'att-1',
              _source: {
                txHash: 'tx-att-1',
                tokenId: 'HOTEL-1234',
                subject: 'erd1subject',
                auditor: 'erd1auditor',
                eventType: 'drwaAttestationRecorded',
                attestationType: 'kyc',
                approved: true,
                attestedRound: 12,
                blockHash: 'block-att-1',
                blockRound: 55,
                isFinalized: true,
                shardID: 3,
                eventOrder: 9,
                timestamp: 1700000020,
              },
            },
          ],
        },
      },
    } as any);

    const result = await service.getDrwaAttestations(
      'HOTEL-1234',
      new QueryPagination({ from: 0, size: 10 }),
    );

    expect(apiService.post).toHaveBeenCalledWith(
      'http://elastic/drwa-attestations/_search',
      expect.objectContaining({
        query: {
          bool: {
            filter: expect.arrayContaining([
              expect.objectContaining({
                bool: expect.objectContaining({
                  minimum_should_match: 1,
                }),
              }),
              { term: { isFinalized: true } },
            ]),
          },
        },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].tokenId).toBe('HOTEL-1234');
    expect(result[0].attestationType).toBe('kyc');
    expect(result[0].approved).toBe(true);
    expect(result[0].attestedRound).toBe(12);
    expect(result[0].blockHash).toBe('block-att-1');
    expect(result[0].blockRound).toBe(55);
    expect(result[0].isFinalized).toBe(true);
    expect(result[0].shardId).toBe(3);
    expect(result[0].eventOrder).toBe(9);
  });

  it('should preserve shardID from indexed denial records', async () => {
    jest.spyOn(apiService, 'post').mockResolvedValue({
      data: {
        hits: {
          hits: [
            {
              _id: 'denial-1',
              _source: {
                txHash: 'tx-hash-1',
                tokenId: 'HOTEL-1234',
                sender: 'erd1sender',
                receiver: 'erd1receiver',
                denialCode: 'DRWA_AML_BLOCKED_SENDER',
                blockHash: 'block-denial-1',
                blockRound: 66,
                isFinalized: false,
                shardID: 7,
                eventOrder: 10,
                timestamp: 1700000100,
              },
            },
          ],
        },
      },
    } as any);

    const result = await service.getDrwaDenials(
      new DrwaDenialFilter({ tokenId: 'HOTEL-1234' }),
      new QueryPagination({ from: 0, size: 10 }),
    );

    expect(apiService.post).toHaveBeenCalledWith(
      'http://elastic/drwa-denials/_search',
      expect.objectContaining({
        query: {
          bool: {
            filter: expect.arrayContaining([
              expect.objectContaining({
                bool: expect.objectContaining({
                  minimum_should_match: 1,
                }),
              }),
              { term: { isFinalized: true } },
            ]),
          },
        },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].denialCode).toBe('DRWA_AML_BLOCKED_SENDER');
    expect(result[0].blockHash).toBe('block-denial-1');
    expect(result[0].blockRound).toBe(66);
    expect(result[0].isFinalized).toBe(false);
    expect(result[0].shardId).toBe(7);
    expect(result[0].eventOrder).toBe(10);
  });

  it('should return undefined for unregulated tokens', async () => {
    jest.spyOn(apiService, 'post').mockResolvedValue({
      data: {
        hits: {
          hits: [
            {
              _source: {
                drwa: {
                  regulated: false,
                },
              },
            },
          ],
        },
      },
    } as any);

    const result = await service.getDrwaTokenPolicy('HOTEL-1234');

    expect(result).toBeUndefined();
  });
});
