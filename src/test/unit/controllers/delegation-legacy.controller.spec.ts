import { mockDelegationService } from "./services.mock/delegation.services.mock";
import { DelegationLegacyController } from "src/endpoints/delegation.legacy/delegation.legacy.controller";
import { DelegationLegacyService } from "src/endpoints/delegation.legacy/delegation.legacy.service";
import { PublicAppModule } from "src/public.app.module";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require('supertest');
import { REDIS_CLIENT_TOKEN } from "@multiversx/sdk-nestjs-redis";

describe('DelegationLegacyController', () => {
  let app: INestApplication;
  const path: string = "/delegation-legacy";
  const delegationLegacyServiceMocks = mockDelegationService();
  const redisClientMock = {};

  beforeAll(async () => {
    jest.resetAllMocks();
    const moduleFixture = await Test.createTestingModule({
      controllers: [DelegationLegacyController],
      imports: [PublicAppModule],
    })
      .overrideProvider(DelegationLegacyService)
      .useValue(delegationLegacyServiceMocks)
      .overrideProvider(REDIS_CLIENT_TOKEN)
      .useValue(redisClientMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  describe("GET /delegation-legacy", () => {
    it('should return delegation legacy staking contract information', async () => {
      delegationLegacyServiceMocks.getDelegation.mockResolvedValue({});

      await request(app.getHttpServer())
        .get(`${path}`)
        .expect(200);

      expect(delegationLegacyServiceMocks.getDelegation).toHaveBeenCalled();
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
