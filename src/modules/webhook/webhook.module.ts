import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaWebhookLog }  from '../../entities/meta-webhook-log.entity';
import { WebhookService }    from './webhook.service';
import { WebhookController } from './webhook.controller';
import { LeadProcessorModule } from '../lead-processor/lead-processor.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MetaWebhookLog]),
    LeadProcessorModule,
  ],
  providers:   [WebhookService],
  controllers: [WebhookController],
})
export class WebhookModule {}
