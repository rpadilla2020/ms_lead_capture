import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Post, Put, Query, Headers,
} from '@nestjs/common';
import { MetaFormsService } from './meta-forms.service';
import { CreateMetaFormConfigDto, UpdateMetaFormConfigDto } from './meta-forms.dto';

@Controller('meta-forms')
export class MetaFormsController {
  constructor(private readonly service: MetaFormsService) {}

  // POST /meta-forms
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateMetaFormConfigDto,
    @Headers('x-account-id') accountId: string,
  ) {
    return this.service.create(dto, Number(accountId));
  }

  // GET /meta-forms?pageConfigId=xxx
  @Get()
  findAll(
    @Headers('x-account-id') accountId: string,
    @Query('pageConfigId') pageConfigId?: string,
  ) {
    return this.service.findAll(Number(accountId), pageConfigId);
  }

  // GET /meta-forms/:id
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Headers('x-account-id') accountId: string,
  ) {
    return this.service.findOne(id, Number(accountId));
  }

  // PUT /meta-forms/:id
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMetaFormConfigDto,
    @Headers('x-account-id') accountId: string,
  ) {
    return this.service.update(id, dto, Number(accountId));
  }

  // DELETE /meta-forms/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @Headers('x-account-id') accountId: string,
  ) {
    return this.service.remove(id, Number(accountId));
  }
}
