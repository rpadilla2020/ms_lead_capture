import {
  Controller, DefaultValuePipe, Get, Headers, HttpCode, HttpStatus,
  Param, ParseIntPipe, Post, Query,
} from '@nestjs/common';
import { MetaLeadsService } from './meta-leads.service';
import { MetaLeadStatus } from '../../entities/meta-lead.entity';

@Controller('meta-leads')
export class MetaLeadsController {
  constructor(private readonly service: MetaLeadsService) {}

  @Get()
  findAll(
    @Headers('x-account-id') accountId: string,
    @Query('status')      status?:     MetaLeadStatus,
    @Query('pageId')      pageId?:     string,
    @Query('formId')      formId?:     string,
    @Query('campaignId')  campaignId?: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.service.findAll(Number(accountId), { status, pageId, formId, campaignId, page, limit });
  }

  @Get('webhook-logs')
  webhookLogs(
    @Query('pageId') pageId?: string,
    @Query('status') status?: string,
    @Query('since')  since?:  string,
    @Query('page',  new DefaultValuePipe(1),   ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit = 100,
  ) {
    return this.service.findWebhookLogs({ pageId, status, since, page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Headers('x-account-id') accountId: string) {
    return this.service.findOne(id, Number(accountId));
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  retry(@Param('id') id: string, @Headers('x-account-id') accountId: string) {
    return this.service.retry(id, Number(accountId));
  }
}
