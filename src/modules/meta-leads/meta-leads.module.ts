import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaLead }       from '../../entities/meta-lead.entity';
import { MetaWebhookLog } from '../../entities/meta-webhook-log.entity';
import { MetaLeadsService }    from './meta-leads.service';
import { MetaLeadsController } from './meta-leads.controller';
import { LeadProcessorModule } from '../lead-processor/lead-processor.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MetaLead, MetaWebhookLog]),
    LeadProcessorModule,
  ],
  providers:   [MetaLeadsService],
  controllers: [MetaLeadsController],
})
export class MetaLeadsModule {}
