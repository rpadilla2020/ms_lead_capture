import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetaLead, MetaLeadStatus } from '../../entities/meta-lead.entity';
import { MetaWebhookLog }           from '../../entities/meta-webhook-log.entity';
import { LeadProcessorService }     from '../lead-processor/lead-processor.service';

@Injectable()
export class MetaLeadsService {
  constructor(
    @InjectRepository(MetaLead)
    private readonly repo: Repository<MetaLead>,
    @InjectRepository(MetaWebhookLog)
    private readonly logRepo: Repository<MetaWebhookLog>,
    private readonly processor: LeadProcessorService,
  ) {}

  // FIX #5 — paginación en findAll
  async findAll(
    accountId: number,
    filters: {
      status?:     MetaLeadStatus;
      pageId?:     string;
      formId?:     string;
      campaignId?: string;
      limit?:      number;
      page?:       number;
    } = {},
  ): Promise<{ data: MetaLead[]; total: number }> {
    const take = Math.min(filters.limit ?? 50, 200);
    const skip = ((filters.page ?? 1) - 1) * take;

    const qb = this.repo
      .createQueryBuilder('ml')
      .leftJoinAndSelect('ml.form_config', 'fc')
      .where('ml.account_id = :accountId', { accountId });

    if (filters.status)     qb.andWhere('ml.status = :status',         { status:     filters.status });
    if (filters.pageId)     qb.andWhere('ml.page_id = :pageId',        { pageId:     filters.pageId });
    if (filters.formId)     qb.andWhere('ml.form_id = :formId',        { formId:     filters.formId });
    if (filters.campaignId) qb.andWhere('ml.campaign_id = :campaignId',{ campaignId: filters.campaignId });

    qb.orderBy('ml.created_at', 'DESC').take(take).skip(skip);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string, accountId: number): Promise<MetaLead> {
    const lead = await this.repo.findOne({
      where:    { id, account_id: accountId },
      relations: ['form_config', 'form_config.page_config'],
    });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    return lead;
  }

  async retry(id: string, accountId: number): Promise<MetaLead> {
    return this.processor.retryLead(id, accountId);
  }

  // FIX #12 — webhook logs con filtro de fecha y paginación
  async findWebhookLogs(
    filters: {
      pageId?: string;
      status?: string;
      since?:  string; // ISO date
      limit?:  number;
      page?:   number;
    } = {},
  ): Promise<{ data: MetaWebhookLog[]; total: number }> {
    const take = Math.min(filters.limit ?? 100, 500);
    const skip = ((filters.page ?? 1) - 1) * take;

    const qb = this.logRepo
      .createQueryBuilder('l')
      .orderBy('l.created_at', 'DESC')
      .take(take).skip(skip);

    if (filters.pageId) qb.andWhere('l.page_id = :pageId', { pageId: filters.pageId });
    if (filters.status) qb.andWhere('l.status = :status',  { status: filters.status });
    if (filters.since) {
      qb.andWhere('l.created_at >= :since', { since: new Date(filters.since) });
    } else {
      // FIX #12 — por defecto solo últimas 24h si no se especifica fecha
      const yesterday = new Date(Date.now() - 86_400_000);
      qb.andWhere('l.created_at >= :since', { since: yesterday });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
