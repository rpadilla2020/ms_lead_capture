import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaPageConfig }       from '../../entities/meta-page-config.entity';
import { MetaWebhookLog }       from '../../entities/meta-webhook-log.entity';
import { TokenMonitorService }    from './token-monitor.service';
import { TokenMonitorController } from './token-monitor.controller';
import { GraphApiModule }         from '../graph-api/graph-api.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MetaPageConfig, MetaWebhookLog]),
    GraphApiModule,
  ],
  providers:   [TokenMonitorService],
  controllers: [TokenMonitorController],
  exports:     [TokenMonitorService],
})
export class TokenMonitorModule {}
