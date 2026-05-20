import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaAdAccount }  from '../../entities/meta-ad-account.entity';
import { MetaPageConfig } from '../../entities/meta-page-config.entity';
import { MetaAdAccountsService }    from './meta-ad-accounts.service';
import { MetaAdAccountsController } from './meta-ad-accounts.controller';
import { GraphApiModule } from '../graph-api/graph-api.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MetaAdAccount, MetaPageConfig]),
    GraphApiModule,
  ],
  providers:   [MetaAdAccountsService],
  controllers: [MetaAdAccountsController],
  exports:     [MetaAdAccountsService],
})
export class MetaAdAccountsModule {}
