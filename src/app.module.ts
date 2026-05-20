import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { MetaPageConfig }    from './entities/meta-page-config.entity';
import { MetaFormConfig }    from './entities/meta-form-config.entity';
import { MetaLead }          from './entities/meta-lead.entity';
import { MetaAdAccount }     from './entities/meta-ad-account.entity';
import { MetaCampaign }      from './entities/meta-campaign.entity';
import { MetaWebhookLog }    from './entities/meta-webhook-log.entity';

import { GraphApiModule }         from './modules/graph-api/graph-api.module';
import { LeadProcessorModule }    from './modules/lead-processor/lead-processor.module';
import { MetaPagesModule }        from './modules/meta-pages/meta-pages.module';
import { MetaFormsModule }        from './modules/meta-forms/meta-forms.module';
import { MetaLeadsModule }        from './modules/meta-leads/meta-leads.module';
import { WebhookModule }          from './modules/webhook/webhook.module';
import { MetaAdAccountsModule }   from './modules/meta-ad-accounts/meta-ad-accounts.module';
import { MetaCampaignsModule }    from './modules/meta-campaigns/meta-campaigns.module';
import { TokenMonitorModule }     from './modules/token-monitor/token-monitor.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    TypeOrmModule.forRoot({
      type:        'mysql',
      host:        process.env.DB_HOST     ?? 'localhost',
      port:        Number(process.env.DB_PORT ?? 3306),
      username:    process.env.DB_USERNAME ?? 'root',
      password:    process.env.DB_PASSWORD ?? '',
      database:    process.env.DB_NAME     ?? 'ms_lead_capture',
      entities:    [
        MetaPageConfig,
        MetaFormConfig,
        MetaLead,
        MetaAdAccount,
        MetaCampaign,
        MetaWebhookLog,
      ],
      synchronize: process.env.NODE_ENV !== 'production',
      charset:     'utf8mb4',
      timezone:    'Z',
    }),

    GraphApiModule,
    LeadProcessorModule,
    MetaPagesModule,
    MetaFormsModule,
    MetaLeadsModule,
    WebhookModule,
    MetaAdAccountsModule,
    MetaCampaignsModule,
    TokenMonitorModule,
  ],
})
export class AppModule {}
