import {
  Body, Controller, Get, Headers, HttpCode,
  HttpStatus, Post, Query, Req,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';

@Controller('webhook')
export class WebhookController {
  constructor(private readonly service: WebhookService) {}

  @Get('meta')
  @HttpCode(HttpStatus.OK)
  verify(@Query() query: Record<string, string>): string {
    return this.service.verify(query);
  }

  @Post('meta')
  @HttpCode(HttpStatus.OK)
  async handleEvent(
    @Req() req: any,
    @Headers('x-hub-signature-256') signature: string,
    @Body() body: any,
  ) {
    const rawBody  = req.rawBody ?? Buffer.from(JSON.stringify(body));
    const remoteIp = req.ip ?? req.headers?.['x-forwarded-for'] ?? null;
    return this.service.handleEvent(rawBody, signature, body, remoteIp);
  }
}
