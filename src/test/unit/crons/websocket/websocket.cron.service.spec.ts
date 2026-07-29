import { WebsocketCronService } from 'src/crons/websocket/websocket.cron.service';
import { CacheInfo } from 'src/utils/cache.info';

describe('WebsocketCronService', () => {
  const refreshRate = 6_000;

  function createService() {
    const cacheService = {
      deleteLocal: jest.fn(),
      getOrSetLocal: jest.fn(),
      setLocal: jest.fn(),
    };
    const transactionsCustomGateway = { pushTransactionsForTimestampMs: jest.fn() };
    const eventsCustomGateway = { pushEventsForTimestampMs: jest.fn() };
    const transfersCustomGateway = { pushTransfersForTimestampMs: jest.fn() };

    const service = new WebsocketCronService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      cacheService as any,
      {} as any,
      {} as any,
      { getStats: jest.fn().mockResolvedValue({ refreshRate, shards: 1 }) } as any,
      transactionsCustomGateway as any,
      eventsCustomGateway as any,
      { hasSubscriptionsWithPrefixes: jest.fn().mockReturnValue(true) } as any,
      transfersCustomGateway as any,
      {} as any,
      {} as any,
    );

    return {
      service,
      cacheService,
      transactionsCustomGateway,
      eventsCustomGateway,
      transfersCustomGateway,
    };
  }

  it('persists progress after each emitted bucket when a later bucket is not index-ready', async () => {
    const {
      service,
      cacheService,
      transactionsCustomGateway,
      eventsCustomGateway,
      transfersCustomGateway,
    } = createService();
    const firstTimestampMs = 100_000;
    const unavailableTimestampMs = firstTimestampMs + 2 * refreshRate;

    cacheService.getOrSetLocal.mockResolvedValue(firstTimestampMs);
    jest.spyOn(service as any, 'getLatestRoundOnChainData').mockResolvedValue({
      timestamp: 0,
      timestampMs: unavailableTimestampMs,
    });
    jest.spyOn(service as any, 'isElasticDataAvailableForTimestampMs')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    jest.spyOn(service, 'pollUntil').mockImplementation(async (condition) => {
      if (await condition() === false) {
        throw new Error('Polling timeout exceeded');
      }
    });

    await expect(service.handleCustomDataUpdate()).rejects.toThrow('Polling timeout exceeded');

    expect(transactionsCustomGateway.pushTransactionsForTimestampMs).toHaveBeenNthCalledWith(1, firstTimestampMs);
    expect(transactionsCustomGateway.pushTransactionsForTimestampMs).toHaveBeenNthCalledWith(2, firstTimestampMs + refreshRate);
    expect(eventsCustomGateway.pushEventsForTimestampMs).toHaveBeenCalledTimes(2);
    expect(transfersCustomGateway.pushTransfersForTimestampMs).toHaveBeenCalledTimes(2);
    expect(cacheService.setLocal).toHaveBeenNthCalledWith(
      1,
      CacheInfo.WsTimestampMsToProcess().key,
      firstTimestampMs + refreshRate,
      CacheInfo.WsTimestampMsToProcess().ttl,
    );
    expect(cacheService.setLocal).toHaveBeenNthCalledWith(
      2,
      CacheInfo.WsTimestampMsToProcess().key,
      unavailableTimestampMs,
      CacheInfo.WsTimestampMsToProcess().ttl,
    );
  });
});
