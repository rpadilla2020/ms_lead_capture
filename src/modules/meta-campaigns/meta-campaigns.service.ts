import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MetaCampaign, MetaCampaignStatus } from '../../entities/meta-campaign.entity';
import { MetaAdAccount }  from '../../entities/meta-ad-account.entity';
import { MetaFormConfig } from '../../entities/meta-form-config.entity';
import { GraphApiService, GraphCampaign } from '../graph-api/graph-api.service';

@Injectable()
export class MetaCampaignsService {
  private readonly logger = new Logger(MetaCampaignsService.name);

  constructor(
    @InjectRepository(MetaCampaign)
    private readonly repo: Repository<MetaCampaign>,
    @InjectRepository(MetaAdAccount)
    private readonly adAccountRepo: Repository<MetaAdAccount>,
    @InjectRepository(MetaFormConfig)
    private readonly formRepo: Repository<MetaFormConfig>,
    private readonly graphApi: GraphApiService,
  ) {}

  // ── Sync campañas ─────────────────────────────────────────────────────

  async syncFromAdAccount(adAccountEntityId: string, accountId: number): Promise<MetaCampaign[]> {
    // FIX #1 — cargar page_token explícitamente (select:false en entidad)
    const adAccount = await this.adAccountRepo
      .createQueryBuilder('aa')
      .leftJoinAndSelect('aa.page_config', 'pc')
      .addSelect('pc.page_token')
      .where('aa.id = :id AND aa.account_id = :accountId', { id: adAccountEntityId, accountId })
      .getOne();
    if (!adAccount) throw new NotFoundException('Ad Account no encontrado');

    // FIX #13 — verificar relación cargada
    if (!adAccount.page_config) throw new Error('page_config no disponible en ad_account');

    const pageToken = adAccount.page_config.page_token;
    const pageId    = adAccount.page_config.page_id;

    // FIX #9 — obtener todas las páginas con paginación de cursores
    const campaigns = await this.graphApi.getAdAccountCampaignsPaginated(
      adAccount.ad_account_id, pageToken,
    );

    // FIX #2 — precargar todos los ad_ids y form_ids existentes en memoria
    // para evitar N+1 queries dentro del loop
    const allAdIds = this.extractAdIds(campaigns);
    const existingCampaigns = allAdIds.length
      ? await this.repo.find({ where: { account_id: accountId, ad_id: In(allAdIds) } })
      : [];
    const existingByAdId = new Map(existingCampaigns.map((c) => [c.ad_id, c]));

    const allFormIds = this.extractFormIds(campaigns);
    const existingForms = allFormIds.length
      ? await this.formRepo.find({
          where: { account_id: accountId, page_id: pageId, form_id: In(allFormIds) },
          select: ['id', 'form_id'],
        })
      : [];
    const formConfigByFormId = new Map(existingForms.map((f) => [f.form_id, f.id]));

    // Procesar todo en batch
    const toInsert: Partial<MetaCampaign>[] = [];
    const toUpdate: Array<{ id: string; data: Partial<MetaCampaign> }> = [];

    for (const camp of campaigns) {
      const adsets = camp.adsets?.data ?? [];
      for (const adset of adsets) {
        for (const ad of adset.ads?.data ?? []) {
          const formId       = ad.creative?.lead_gen_form?.id ?? null;
          const formConfigId = formId ? (formConfigByFormId.get(formId) ?? null) : null;
          const status       = this.parseStatus(camp.status);
          const existing     = existingByAdId.get(ad.id);

          if (existing) {
            toUpdate.push({
              id:   existing.id,
              data: {
                campaign_name:  camp.name,  adset_name:    adset.name,
                ad_name:        ad.name,    form_id:       formId,
                form_config_id: formConfigId ?? existing.form_config_id,
                status,         is_active:   status === MetaCampaignStatus.ACTIVE,
                synced_at:      new Date(),
              },
            });
          } else {
            toInsert.push({
              account_id:           accountId,
              ad_account_entity_id: adAccount.id,
              campaign_id:          camp.id,    campaign_name: camp.name,
              adset_id:             adset.id,   adset_name:    adset.name,
              ad_id:                ad.id,      ad_name:       ad.name,
              form_id:              formId,      form_config_id: formConfigId,
              status,               is_active:  status === MetaCampaignStatus.ACTIVE,
              synced_at:            new Date(),
            });
          }
        }
      }
    }

    // Ejecutar writes en lote
    if (toInsert.length) {
      await this.repo.save(toInsert.map((d) => this.repo.create(d)));
    }
    for (const { id, data } of toUpdate) {
      await this.repo.update(id, data);
    }

    const total = toInsert.length + toUpdate.length;
    this.logger.log(`[Campaigns] Sync OK — ${total} ads (${toInsert.length} new, ${toUpdate.length} updated)`);

    return this.repo.find({
      where:    { account_id: accountId, ad_account_entity_id: adAccountEntityId },
      relations: ['form_config'],
      order:    { campaign_name: 'ASC' },
    });
  }

  // ── Vincular campaña a form_config ────────────────────────────────────

  async linkToFormConfig(
    campaignEntityId: string, formConfigId: string, accountId: number,
  ): Promise<MetaCampaign> {
    const campaign   = await this.findOne(campaignEntityId, accountId);
    const formConfig = await this.formRepo.findOne({ where: { id: formConfigId, account_id: accountId } });
    if (!formConfig) throw new NotFoundException('FormConfig no encontrado');
    await this.repo.update(campaign.id, { form_config_id: formConfigId });
    return this.findOne(campaignEntityId, accountId);
  }

  // ── CRUD con paginación ───────────────────────────────────────────────

  // FIX #5 — paginación en findAll
  async findAll(
    accountId: number,
    filters: {
      adAccountEntityId?: string;
      formConfigId?:      string;
      status?:            MetaCampaignStatus;
      page?:              number;
      limit?:             number;
    } = {},
  ): Promise<{ data: MetaCampaign[]; total: number }> {
    const take = Math.min(filters.limit ?? 50, 200);
    const skip = ((filters.page ?? 1) - 1) * take;
    const where: any = { account_id: accountId };
    if (filters.adAccountEntityId) where.ad_account_entity_id = filters.adAccountEntityId;
    if (filters.formConfigId)      where.form_config_id       = filters.formConfigId;
    if (filters.status)            where.status               = filters.status;

    const [data, total] = await this.repo.findAndCount({
      where, relations: ['ad_account', 'form_config'],
      order: { campaign_name: 'ASC' }, take, skip,
    });
    return { data, total };
  }

  async findOne(id: string, accountId: number): Promise<MetaCampaign> {
    const campaign = await this.repo.findOne({
      where:    { id, account_id: accountId },
      relations: ['ad_account', 'form_config'],
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    return campaign;
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private extractAdIds(campaigns: GraphCampaign[]): string[] {
    const ids: string[] = [];
    for (const c of campaigns)
      for (const as of c.adsets?.data ?? [])
        for (const ad of as.ads?.data ?? [])
          ids.push(ad.id);
    return ids;
  }

  private extractFormIds(campaigns: GraphCampaign[]): string[] {
    const ids: string[] = [];
    for (const c of campaigns)
      for (const as of c.adsets?.data ?? [])
        for (const ad of as.ads?.data ?? []) {
          const fid = ad.creative?.lead_gen_form?.id;
          if (fid) ids.push(fid);
        }
    return [...new Set(ids)];
  }

  private parseStatus(raw: string): MetaCampaignStatus {
    const map: Record<string, MetaCampaignStatus> = {
      ACTIVE: MetaCampaignStatus.ACTIVE, PAUSED: MetaCampaignStatus.PAUSED,
      ARCHIVED: MetaCampaignStatus.ARCHIVED, DELETED: MetaCampaignStatus.DELETED,
    };
    return map[raw?.toUpperCase()] ?? MetaCampaignStatus.PAUSED;
  }
}
