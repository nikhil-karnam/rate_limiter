import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { RedisModule } from './redis/redis.module.js';
import { RateLimiterGuard } from './rate-limiter/rate-limiter.guard.js';
import { DumpsterfireGuard } from './rate-limiter/dumpsterfire.guard.js';

@Module({
  imports: [RedisModule],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: process.env.MODE === 'dumpsterfire' ? DumpsterfireGuard : RateLimiterGuard },
  ],
})
export class AppModule {}