import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { MetaLead }          from '../../entities/meta-lead.entity';
import { MetaFormConfig }    from '../../entities/meta-form-config.entity';
import { MetaPageConfig }    from '../../entities/meta-page-config.entity';
import { MetaWebhookLog }    from '../../entities/meta-webhook-log.entity';
import { GraphApiModule }    from '../graph-api/graph-api.module';
import { LeadProcessorService } from './lead-processor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MetaLead, MetaFormConfig, MetaPageConfig, MetaWebhookLog]),
    HttpModule,
    GraphApiModule,
  ],
  providers: [LeadProcessorService],
  exports:   [LeadProcessorService],
})
export class LeadProcessorModule {}
