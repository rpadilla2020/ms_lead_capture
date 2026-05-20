import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaCampaign }   from '../../entities/meta-campaign.entity';
import { MetaAdAccount }  from '../../entities/meta-ad-account.entity';
import { MetaPageConfig } from '../../entities/meta-page-config.entity';
import { MetaFormConfig } from '../../entities/meta-form-config.entity';
import { MetaCampaignsService }    from './meta-campaigns.service';
import { MetaCampaignsController } from './meta-campaigns.controller';
import { GraphApiModule } from '../graph-api/graph-api.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MetaCampaign, MetaAdAccount, MetaPageConfig, MetaFormConfig]),
    GraphApiModule,
  ],
  providers:   [MetaCampaignsService],
  controllers: [MetaCampaignsController],
  exports:     [MetaCampaignsService],
})
export class MetaCampaignsModule {}
