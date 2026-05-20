import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { MetaPageConfig } from '../../entities/meta-page-config.entity';
import { MetaPagesService } from './meta-pages.service';
import { MetaPagesController } from './meta-pages.controller';
import { GraphApiModule } from '../graph-api/graph-api.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MetaPageConfig]),
    HttpModule,
    GraphApiModule,
  ],
  providers:   [MetaPagesService],
  controllers: [MetaPagesController],
  exports:     [MetaPagesService],
})
export class MetaPagesModule {}
