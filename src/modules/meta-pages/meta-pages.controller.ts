import {
  Controller, DefaultValuePipe, Delete, Get, Headers,
  HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Query,
} from '@nestjs/common';
import { MetaPagesService } from './meta-pages.service';
import { GraphApiService }  from '../graph-api/graph-api.service';

@Controller('meta-pages')
export class MetaPagesController {
  constructor(
    private readonly pagesService: MetaPagesService,
    private readonly graphApi: GraphApiService,
  ) {}

  @Patch('sync/:accountId')
  @HttpCode(HttpStatus.OK)
  sync(@Param('accountId', ParseIntPipe) accountId: number) {
    return this.pagesService.syncFromSocialcc(accountId);
  }

  // FIX #10 — paginación
  @Get()
  findAll(
    @Headers('x-account-id') accountId: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.pagesService.findAll(Number(accountId), page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Headers('x-account-id') accountId: string) {
    return this.pagesService.findOne(id, Number(accountId));
  }

  @Get(':id/ad-forms')
  async getAdForms(
    @Param('id') id: string,
    @Headers('x-account-id') accountId: string,
  ) {
    // FIX #1 — usar findOneWithToken para obtener el token sin exponerlo en respuestas
    const page = await this.pagesService.findOneWithToken(id, Number(accountId));
    return this.graphApi.getPageForms(page.page_id, page.page_token);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string, @Headers('x-account-id') accountId: string) {
    return this.pagesService.toggle(id, Number(accountId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Headers('x-account-id') accountId: string) {
    return this.pagesService.remove(id, Number(accountId));
  }
}
