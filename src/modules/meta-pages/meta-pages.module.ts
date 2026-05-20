import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { MetaPageConfig }          from '../../entities/meta-page-config.entity';
import { MetaPagesService }         from './meta-pages.service';
import { MetaPagesController }      from './meta-pages.controller';
import { FacebookOAuthService }     from './facebook-oauth.service';
import { FacebookOAuthController }  from './facebook-oauth.controller';
import { GraphApiModule }           from '../graph-api/graph-api.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MetaPageConfig]),
    HttpModule,
    GraphApiModule,
  ],
  providers:   [MetaPagesService, FacebookOAuthService],
  controllers: [MetaPagesController, FacebookOAuthController],
  exports:     [MetaPagesService],
})
export class MetaPagesModule {}
