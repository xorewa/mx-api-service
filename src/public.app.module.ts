import { Module } from '@nestjs/common';
import '@multiversx/sdk-nestjs-common/lib/utils/extensions/array.extensions';
import '@multiversx/sdk-nestjs-common/lib/utils/extensions/date.extensions';
import '@multiversx/sdk-nestjs-common/lib/utils/extensions/number.extensions';
import '@multiversx/sdk-nestjs-common/lib/utils/extensions/string.extensions';
import { EndpointsServicesModule } from './endpoints/endpoints.services.module';
import { EndpointsControllersModule } from './endpoints/endpoints.controllers.module';
import { GuestCacheService } from '@multiversx/sdk-nestjs-cache';
import { LoggingModule } from '@multiversx/sdk-nestjs-common';
import { DynamicModuleUtils } from './utils/dynamic.module.utils';
import { LocalCacheController } from './endpoints/caching/local.cache.controller';
import { RestrictedRoutesMiddleware } from './utils/restricted.routes.middleware';
import { ApiMetricsModule } from './common/metrics/api.metrics.module';
import { ApiConfigModule } from './common/api-config/api.config.module';
import { ApiConfigService } from './common/api-config/api.config.service';
import { PersistenceModule } from './common/persistence/persistence.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ScheduleModule.forRoot(), // for plugins, best practice not to have crons in public API
    EventEmitterModule.forRoot({ maxListeners: 1 }),
    PersistenceModule.forRoot(),
    LoggingModule,
    EndpointsServicesModule,
    EndpointsControllersModule.forRoot(),
    DynamicModuleUtils.getRedisCacheModule(),
    ApiMetricsModule,
    ThrottlerModule.forRootAsync({
      imports: [ApiConfigModule],
      inject: [ApiConfigService],
      useFactory: (apiConfigService: ApiConfigService) => [
        apiConfigService.getRateLimiterOptions(),
      ],
    }),
  ],
  controllers: [
    LocalCacheController,
  ],
  providers: [
    DynamicModuleUtils.getNestJsApiConfigService(),
    GuestCacheService,
    RestrictedRoutesMiddleware,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [
    EndpointsServicesModule,
  ],
})
export class PublicAppModule { }
