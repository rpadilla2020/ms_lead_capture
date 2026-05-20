import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaFormConfig } from '../../entities/meta-form-config.entity';
import { MetaPageConfig } from '../../entities/meta-page-config.entity';
import { MetaFormsService } from './meta-forms.service';
import { MetaFormsController } from './meta-forms.controller';

@Module({
  imports:     [TypeOrmModule.forFeature([MetaFormConfig, MetaPageConfig])],
  providers:   [MetaFormsService],
  controllers: [MetaFormsController],
  exports:     [MetaFormsService],
})
export class MetaFormsModule {}
