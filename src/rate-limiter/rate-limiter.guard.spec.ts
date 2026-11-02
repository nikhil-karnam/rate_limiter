import { RateLimiterGuard } from './rate-limiter.guard.js';

describe('RateLimiterGuard', () => {
  it('should be defined', () => {
    expect(new RateLimiterGuard()).toBeDefined();
  });
});
