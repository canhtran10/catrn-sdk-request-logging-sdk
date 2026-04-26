import { Body, Controller, Get, Post } from '@nestjs/common';

@Controller()
export class AppController {
  /**
   * @returns Health payload
   */
  @Get()
  root(): { ok: boolean; service: string } {
    return { ok: true, service: 'nest-request-log-demo' };
  }

  /**
   * @returns Sample JSON for log capture
   */
  @Get('hello')
  hello(): { message: string } {
    return { message: 'Hello from Nest' };
  }

  /**
   * @param body - Echoed JSON (exercise request body in logs)
   * @returns Wrapped body
   */
  @Post('echo')
  echo(@Body() body: unknown): { received: unknown } {
    return { received: body };
  }
}
