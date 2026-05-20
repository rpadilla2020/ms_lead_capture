import { Controller, Get, Headers, Param, Patch, Query } from '@nestjs/common';
import { MetaAdAccountsService } from './meta-ad-accounts.service';

@Controller('meta-ad-accounts')
export class MetaAdAccountsController {
  constructor(private readonly service: MetaAdAccountsService) {}

  /** GET /meta-ad-accounts?pageConfigId=xxx */
  @Get()
  findAll(
    @Headers('x-account-id') accountId: string,
    @Query('pageConfigId') pageConfigId?: string,
  ) {
    return this.service.findAll(Number(accountId), pageConfigId);
  }

  /** GET /meta-ad-accounts/:id */
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Headers('x-account-id') accountId: string,
  ) {
    return this.service.findOne(id, Number(accountId));
  }

  /** PATCH /meta-ad-accounts/sync/:pageConfigId — sincronizar desde Graph API */
  @Patch('sync/:pageConfigId')
  sync(
    @Param('pageConfigId') pageConfigId: string,
    @Headers('x-account-id') accountId: string,
  ) {
    return this.service.syncFromGraphApi(pageConfigId, Number(accountId));
  }
}
