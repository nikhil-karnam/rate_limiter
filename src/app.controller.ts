import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { times } from './rate-limiter/times.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('stats')
  getStats(): number[] {
    return times.splice(0);
  }
}