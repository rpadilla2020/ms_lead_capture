import { Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { TokenMonitorService } from './token-monitor.service';

@Controller('meta-pages')
export class TokenMonitorController {
  constructor(private readonly service: TokenMonitorService) {}

  /** POST /meta-pages/:id/subscribe-webhook */
  @Post(':id/subscribe-webhook')
  @HttpCode(HttpStatus.OK)
  subscribe(
    @Param('id') id: string,
    @Headers('x-account-id') accountId: string,
  ) {
    return this.service.subscribeToWebhook(id, Number(accountId));
  }

  /** GET /meta-pages/:id/webhook-status */
  @Get(':id/webhook-status')
  webhookStatus(
    @Param('id') id: string,
    @Headers('x-account-id') accountId: string,
  ) {
    return this.service.checkWebhookSubscription(id, Number(accountId));
  }

  /** POST /meta-pages/:id/refresh-token */
  @Post(':id/refresh-token')
  @HttpCode(HttpStatus.OK)
  refreshToken(
    @Param('id') id: string,
    @Headers('x-account-id') accountId: string,
  ) {
    return this.service.refreshTokenInfo(id, Number(accountId));
  }
}
