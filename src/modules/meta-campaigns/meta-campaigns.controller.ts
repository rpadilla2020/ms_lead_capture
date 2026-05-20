import {
  Body, Controller, Get, Headers, HttpCode, HttpStatus,
  Param, Patch, Query, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { MetaCampaignsService } from './meta-campaigns.service';
import { MetaCampaignStatus } from '../../entities/meta-campaign.entity';

@Controller('meta-campaigns')
export class MetaCampaignsController {
  constructor(private readonly service: MetaCampaignsService) {}

  @Get()
  findAll(
    @Headers('x-account-id') accountId: string,
    @Query('adAccountEntityId') adAccountEntityId?: string,
    @Query('formConfigId')      formConfigId?: string,
    @Query('status')            status?: MetaCampaignStatus,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.service.findAll(Number(accountId), { adAccountEntityId, formConfigId, status, page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Headers('x-account-id') accountId: string) {
    return this.service.findOne(id, Number(accountId));
  }

  @Patch('sync/:adAccountEntityId')
  @HttpCode(HttpStatus.OK)
  sync(
    @Param('adAccountEntityId') adAccountEntityId: string,
    @Headers('x-account-id') accountId: string,
  ) {
    return this.service.syncFromAdAccount(adAccountEntityId, Number(accountId));
  }

  @Patch(':id/link-form')
  @HttpCode(HttpStatus.OK)
  linkForm(
    @Param('id') id: string,
    @Body('form_config_id') formConfigId: string,
    @Headers('x-account-id') accountId: string,
  ) {
    return this.service.linkToFormConfig(id, formConfigId, Number(accountId));
  }
}
