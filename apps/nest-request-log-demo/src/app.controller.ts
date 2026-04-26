import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Head,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';

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
   * @returns Simple JSON
   */
  @Get('hello')
  hello(): { message: string } {
    return { message: 'Hello from Nest' };
  }

  /**
   * @returns Liveness-style payload
   */
  @Get('health')
  health(): { status: string; uptimeSec: number } {
    return { status: 'up', uptimeSec: Math.floor(process.uptime()) };
  }

  /**
   * @returns Build metadata for logs
   */
  @Get('version')
  version(): { version: string; node: string } {
    return { version: '0.0.1', node: process.version };
  }

  /**
   * @param id - Path segment
   */
  @Get('users/:id')
  getUser(@Param('id') id: string): { id: string; name: string } {
    return { id, name: `User ${id}` };
  }

  /**
   * @param q - Search text
   * @param limit - Page size hint
   */
  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): { q: string; limit: number } {
    const lim = limit ? parseInt(limit, 10) : 10;
    return { q: q ?? '', limit: Number.isFinite(lim) ? lim : 10 };
  }

  /**
   * @param headers - Selected headers (for testing x-user-id in logs)
   */
  @Get('headers/dump')
  dumpHeaders(
    @Headers('user-agent') ua?: string,
    @Headers('x-user-id') xUser?: string,
    @Headers('x-customer-id') xCustomer?: string,
  ): { userAgent?: string; xUserId?: string; xCustomerId?: string } {
    return { userAgent: ua, xUserId: xUser, xCustomerId: xCustomer };
  }

  /**
   * @param ms - Delay in ms (capped) to stretch duration_ms in logs
   */
  @Get('slow')
  async slow(@Query('ms') ms?: string): Promise<{ waitedMs: number }> {
    const n = Math.min(3000, Math.max(0, parseInt(ms ?? '80', 10) || 80));
    await new Promise((r) => setTimeout(r, n));
    return { waitedMs: n };
  }

  /**
   * @param body - Echoed JSON (exercise request body in logs)
   */
  @Post('echo')
  echo(@Body() body: unknown): { received: unknown } {
    return { received: body };
  }

  /**
   * @param body - Nested JSON (blob / UI detail formatting)
   */
  @Post('nested')
  nested(
    @Body()
    body: {
      meta?: { traceId?: string };
      items?: unknown[];
    },
  ): { echo: typeof body } {
    return { echo: body };
  }

  /**
   * @param body - Create-style payload
   */
  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  createOrder(
    @Body() body: { sku?: string; qty?: number },
  ): { orderId: string; sku?: string; qty?: number } {
    return { orderId: `ord_${Date.now()}`, ...body };
  }

  /**
   * @param id - Resource id
   * @param body - Full replacement
   */
  @Put('items/:id')
  replaceItem(
    @Param('id') id: string,
    @Body() body: unknown,
  ): { id: string; replaced: boolean; body: unknown } {
    return { id, replaced: true, body };
  }

  /**
   * @param id - Resource id
   * @param body - Partial update
   */
  @Patch('items/:id')
  patchItem(
    @Param('id') id: string,
    @Body() body: unknown,
  ): { id: string; patched: boolean; body: unknown } {
    return { id, patched: true, body };
  }

  /**
   * @param id - Resource id
   */
  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(@Param('id') _id: string): void {
    /* 204 no body */
  }

  /**
   * HEAD without body — still hits capture for method/status.
   */
  @Head('peek')
  @HttpCode(HttpStatus.OK)
  peek(): void {
    /* empty 200 */
  }

  /** @returns 404 for error styling in activity UI */
  @Get('errors/not-found')
  notFound(): never {
    throw new NotFoundException('Test 404 — missing resource');
  }

  /** @returns 401 */
  @Get('errors/unauthorized')
  unauthorized(): never {
    throw new UnauthorizedException('Test 401');
  }

  /** @returns 403 */
  @Get('errors/forbidden')
  forbidden(): never {
    throw new ForbiddenException('Test 403');
  }

  /** @returns 400 */
  @Get('errors/bad-request')
  badRequest(): never {
    throw new BadRequestException('Test 400');
  }

  /** @returns 500 */
  @Get('errors/server')
  serverError(): never {
    throw new InternalServerErrorException('Test 500');
  }
}
