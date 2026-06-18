import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ApiService } from "@multiversx/sdk-nestjs-http";
import request = require("supertest");
import fetch, { RequestInit as NodeFetchRequestInit } from "node-fetch";
import { ApiConfigService } from "src/common/api-config/api.config.service";
import { GatewayService } from "src/common/gateway/gateway.service";
import { DrwaController } from "src/endpoints/drwa/drwa.controller";
import { DrwaService } from "src/endpoints/drwa/drwa.service";

const describeIfElastic = process.env.DRWA_ES_E2E === "1" ? describe : describe.skip;
const elasticUrl = process.env.DRWA_ES_URL ?? "http://localhost:9200";

describeIfElastic("DRWA API (real elastic)", () => {
  let app: INestApplication;

  const tokenId = "HOTEL-ab12cd";
  const tokenDocId = "drwa-api-token-hotel-ab12cd";
  const policyDocId = "drwa-api-policy-hotel-ab12cd-v2";
  const denialDocId = "drwa-api-denial-hotel-ab12cd";
  const attestationDocId = "drwa-api-attestation-hotel-ab12cd";

  async function elasticRequest(path: string, init?: NodeFetchRequestInit): Promise<any> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    };
    const requestInit: NodeFetchRequestInit = {
      method: init?.method,
      headers,
    };

    if (init?.body !== undefined && init?.body !== null) {
      requestInit.body = init.body;
    }

    const response = await fetch(`${elasticUrl}${path}`, requestInit);

    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      throw new Error(`elastic ${response.status} ${path}: ${text}`);
    }

    return data;
  }

  async function putDocument(index: string, id: string, body: Record<string, unknown>): Promise<void> {
    await elasticRequest(`/${index}/_doc/${id}?refresh=wait_for`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async function deleteDocument(index: string, id: string): Promise<void> {
    try {
      await elasticRequest(`/${index}/_doc/${id}?refresh=wait_for`, {
        method: "DELETE",
      });
    } catch (error: any) {
      if (!String(error?.message ?? "").includes("404")) {
        throw error;
      }
    }
  }

  beforeAll(async () => {
    await elasticRequest("/");

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DrwaController],
      providers: [
        DrwaService,
        {
          provide: ApiConfigService,
          useValue: {
            getElasticUrl: () => elasticUrl,
          },
        },
        {
          provide: ApiService,
          useValue: {
            post: async (url: string, body: unknown) => {
              const response = await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              });
              const data = await response.json();
              return { data };
            },
          },
        },
        {
          provide: GatewayService,
          useValue: {
            get: () => Promise.resolve(undefined),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    await putDocument("tokens", tokenDocId, {
      identifier: tokenId,
      drwa: {
        regulated: true,
        policyId: "policy-1",
        tokenPolicyVersion: 2,
        globalPause: false,
        strictAuditorMode: true,
      },
    });

    await putDocument("drwa-token-policies", policyDocId, {
      tokenId,
      eventType: "drwaTokenPolicy",
      policyId: "policy-1",
      regulated: true,
      globalPause: false,
      strictAuditorMode: true,
      tokenPolicyVersion: 2,
      timestamp: 1700000000,
    });

    await putDocument("drwa-denials", denialDocId, {
      txHash: "0xdenial1",
      tokenId,
      sender: "erd1sender",
      receiver: "erd1receiver",
      denialCode: "DRWA_KYC_REQUIRED",
      shardId: 1,
      timestamp: 1700000001,
    });

    await putDocument("drwa-attestations", attestationDocId, {
      txHash: "0xattestation1",
      tokenId,
      subject: "erd1subject",
      auditor: "erd1auditor",
      eventType: "drwaAttestationRecorded",
      approved: true,
      attestedRound: 42,
      timestamp: 1700000002,
    });
  });

  afterAll(async () => {
    await deleteDocument("drwa-attestations", attestationDocId);
    await deleteDocument("drwa-denials", denialDocId);
    await deleteDocument("drwa-token-policies", policyDocId);
    await deleteDocument("tokens", tokenDocId);

    if (app) {
      await app.close();
    }
  });

  it("returns DRWA token policy with history from elastic", async () => {
    await request(app.getHttpServer())
      .get(`/drwa/tokens/${tokenId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.regulated).toBe(true);
        expect(response.body.policyId).toBe("policy-1");
        expect(response.body.tokenPolicyVersion).toBe(2);
        expect(response.body.history).toHaveLength(1);
        expect(response.body.history[0].eventType).toBe("drwaTokenPolicy");
      });
  });

  it("returns DRWA denials from elastic", async () => {
    await request(app.getHttpServer())
      .get(`/drwa/denials?tokenId=${tokenId}&denialCode=DRWA_KYC_REQUIRED`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
        expect(response.body[0].txHash).toBe("0xdenial1");
        expect(response.body[0].denialCode).toBe("DRWA_KYC_REQUIRED");
      });
  });

  it("returns DRWA attestations from elastic", async () => {
    await request(app.getHttpServer())
      .get(`/drwa/attestations/${tokenId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
        expect(response.body[0].auditor).toBe("erd1auditor");
        expect(response.body[0].approved).toBe(true);
      });
  });
});
