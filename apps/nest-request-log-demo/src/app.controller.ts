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
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('nest-request-log-demo')
@Controller()
export class AppController {
  @ApiOperation({ summary: 'Service root' })
  @ApiOkResponse({
    description: 'Health-style payload',
    schema: {
      example: { ok: true, service: 'nest-request-log-demo' },
    },
  })
  @Get()
  root(): { ok: boolean; service: string } {
    return { ok: true, service: 'nest-request-log-demo' };
  }

  @ApiOperation({ summary: 'Hello JSON' })
  @ApiOkResponse({
    schema: { example: { message: 'Hello from Nest' } },
  })
  @Get('hello')
  hello(): { message: string } {
    return { message: 'Hello from Nest' };
  }

  @ApiOperation({ summary: 'Liveness' })
  @ApiOkResponse({
    schema: {
      example: { status: 'up', uptimeSec: 42 },
    },
  })
  @Get('health')
  health(): { status: string; uptimeSec: number } {
    return { status: 'up', uptimeSec: Math.floor(process.uptime()) };
  }

  @ApiOperation({ summary: 'Build metadata' })
  @ApiOkResponse({
    schema: {
      example: { version: '0.0.1', node: process.version },
    },
  })
  @Get('version')
  version(): { version: string; node: string } {
    return { version: '0.0.1', node: process.version };
  }

  @ApiParam({ name: 'id', description: 'User id' })
  @ApiOperation({ summary: 'Get user by id' })
  @ApiOkResponse({
    schema: { example: { id: '1', name: 'User 1' } },
  })
  @Get('users/:id')
  getUser(@Param('id') id: string): { id: string; name: string } {
    return { id, name: `User ${id}` };
  }

  @ApiOperation({ summary: 'Search with query params' })
  @ApiQuery({ name: 'q', required: false, description: 'Search text' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size hint',
  })
  @ApiOkResponse({
    schema: { example: { q: 'foo', limit: 10 } },
  })
  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): { q: string; limit: number } {
    const lim = limit ? parseInt(limit, 10) : 10;
    return { q: q ?? '', limit: Number.isFinite(lim) ? lim : 10 };
  }

  @ApiOperation({ summary: 'Echo selected headers (x-user-id for logs)' })
  @ApiOkResponse({
    schema: {
      example: {
        userAgent: 'curl/8',
        xUserId: 'user-123',
        xCustomerId: 'cust-456',
      },
    },
  })
  @Get('headers/dump')
  dumpHeaders(
    @Headers('user-agent') ua?: string,
    @Headers('x-user-id') xUser?: string,
    @Headers('x-customer-id') xCustomer?: string,
  ): { userAgent?: string; xUserId?: string; xCustomerId?: string } {
    return { userAgent: ua, xUserId: xUser, xCustomerId: xCustomer };
  }

  @ApiOperation({ summary: 'Delayed response (caps duration in logs)' })
  @ApiQuery({
    name: 'ms',
    required: false,
    description: 'Delay in ms (0–3000)',
  })
  @ApiOkResponse({ schema: { example: { waitedMs: 80 } } })
  @Get('slow')
  async slow(@Query('ms') ms?: string): Promise<{ waitedMs: number }> {
    const n = Math.min(3000, Math.max(0, parseInt(ms ?? '80', 10) || 80));
    await new Promise((r) => setTimeout(r, n));
    return { waitedMs: n };
  }

  @ApiOperation({ summary: 'Echo JSON body' })
  @ApiBody({
    required: false,
    schema: { example: { hello: 'world' } },
  })
  @ApiOkResponse({
    schema: { example: { received: { hello: 'world' } } },
  })
  @Post('echo')
  echo(@Body() body: unknown): { received: unknown } {
    return { received: body };
  }

  @ApiOperation({ summary: 'Nested JSON (blob / UI formatting)' })
  @ApiBody({
    schema: {
      example: { meta: { traceId: 'abc' }, items: [{ id: 1 }] },
    },
  })
  @ApiOkResponse({
    schema: {
      example: {
        echo: { meta: { traceId: 'abc' }, items: [{ id: 1 }] },
      },
    },
  })
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

  @ApiOperation({ summary: 'Create order (201)' })
  @ApiBody({
    schema: { example: { sku: 'SKU-1', qty: 2 } },
  })
  @ApiCreatedResponse({
    schema: {
      example: { orderId: 'ord_123', sku: 'SKU-1', qty: 2 },
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post('orders')
  createOrder(
    @Body() body: { sku?: string; qty?: number },
  ): { orderId: string; sku?: string; qty?: number } {
    return { orderId: `ord_${Date.now()}`, ...body };
  }

  @ApiParam({ name: 'id', description: 'Resource id' })
  @ApiOperation({ summary: 'Replace item' })
  @ApiBody({ schema: { example: { name: 'updated' } } })
  @ApiOkResponse({
    schema: {
      example: { id: '1', replaced: true, body: { name: 'updated' } },
    },
  })
  @Put('items/:id')
  replaceItem(
    @Param('id') id: string,
    @Body() body: unknown,
  ): { id: string; replaced: boolean; body: unknown } {
    return { id, replaced: true, body };
  }

  @ApiParam({ name: 'id', description: 'Resource id' })
  @ApiOperation({ summary: 'Patch item' })
  @ApiBody({ schema: { example: { qty: 3 } } })
  @ApiOkResponse({
    schema: {
      example: { id: '1', patched: true, body: { qty: 3 } },
    },
  })
  @Patch('items/:id')
  patchItem(
    @Param('id') id: string,
    @Body() body: unknown,
  ): { id: string; patched: boolean; body: unknown } {
    return { id, patched: true, body };
  }

  @ApiParam({ name: 'id', description: 'Resource id' })
  @ApiOperation({ summary: 'Delete item (204)' })
  @ApiNoContentResponse({ description: 'No body' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('items/:id')
  deleteItem(@Param('id') _id: string): void {
    /* 204 no body */
  }

  @ApiOperation({ summary: 'HEAD with empty body' })
  @ApiOkResponse({ description: 'Empty 200' })
  @HttpCode(HttpStatus.OK)
  @Head('peek')
  peek(): void {
    /* empty 200 */
  }

  @ApiOperation({ summary: 'Demo 404' })
  @ApiResponse({ status: 404, description: 'NotFoundException' })
  @Get('errors/not-found')
  notFound(): never {
    throw new NotFoundException('Test 404 — missing resource');
  }

  @ApiOperation({ summary: 'Demo 401' })
  @ApiResponse({ status: 401, description: 'UnauthorizedException' })
  @Get('errors/unauthorized')
  unauthorized(): never {
    throw new UnauthorizedException('Test 401');
  }

  @ApiOperation({ summary: 'Demo 403' })
  @ApiResponse({ status: 403, description: 'ForbiddenException' })
  @Get('errors/forbidden')
  forbidden(): never {
    throw new ForbiddenException('Test 403');
  }

  @ApiOperation({ summary: 'Demo 400' })
  @ApiResponse({ status: 400, description: 'BadRequestException' })
  @Get('errors/bad-request')
  badRequest(): never {
    throw new BadRequestException('Test 400');
  }

  @ApiOperation({ summary: 'Demo 500' })
  @ApiResponse({
    status: 500,
    description: 'InternalServerErrorException',
  })
  @Get('errors/server')
  serverError(): never {
    throw new InternalServerErrorException('Test 500');
  }
}
