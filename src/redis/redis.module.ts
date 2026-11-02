import { Module } from '@nestjs/common';
import { createClient } from 'redis';

@Module({
  providers: [
    {
      provide: 'REDIS_CLIENTS',
      useFactory: async () => {
        const urls = ['redis://localhost:6379',
                      'redis://localhost:6380',
                      'redis://localhost:6381'];
        const clients = [];

        for (const url of urls) {
          // disableOfflineQueue makes commands fail right away when Redis is down, allowing fallback to kick in right away
          const client = createClient({ url, disableOfflineQueue: true });
          client.on('error', () => {});
          await client.connect();
          clients.push(client);
        }

        return clients;
      },
    },
  ],
  exports: ['REDIS_CLIENTS'],
})
export class RedisModule {}