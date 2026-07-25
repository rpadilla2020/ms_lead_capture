import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom, timeout } from 'rxjs';
import { MetaLead, MetaLeadStatus } from '../../entities/meta-lead.entity';
import { MetaFormConfig }  from '../../entities/meta-form-config.entity';
import { MetaPageConfig }  from '../../entities/meta-page-config.entity';
import { MetaWebhookLog, WebhookLogStatus } from '../../entities/meta-webhook-log.entity';
import { GraphApiService } from '../graph-api/graph-api.service';
import { UsersClientService } from '../users-client/users-client.service';

/** Máximo de leads procesados en paralelo por batch de webhook */
const WEBHOOK_CONCURRENCY = Number(process.env.WEBHOOK_CONCURRENCY ?? 5);

/** Timeout en ms para llamadas a ms_opportunities */
const OPP_TIMEOUT_MS = Number(process.env.OPP_TIMEOUT_MS ?? 10_000);

@Injectable()
export class LeadProcessorService {
  private readonly logger = new Logger(LeadProcessorService.name);
  private readonly oppUrl = process.env.OPPORTUNITIES_INTERNAL_URL ?? 'http://ms_opportunities:3000';

  constructor(
    @InjectRepository(MetaLead)
    private readonly leadRepo: Repository<MetaLead>,
    @InjectRepository(MetaFormConfig)
    private readonly formRepo: Repository<MetaFormConfig>,
    @InjectRepository(MetaPageConfig)
    private readonly pageRepo: Repository<MetaPageConfig>,
    @InjectRepository(MetaWebhookLog)
    private readonly logRepo: Repository<MetaWebhookLog>,
    private readonly graphApi: GraphApiService,
    private readonly http: HttpService,
    private readonly usersClient: UsersClientService,
  ) {}

  // ─── Procesar evento webhook con concurrencia limitada ───────────────

  async processWebhookEvent(entry: any, remoteIp?: string): Promise<void> {
    const pageId  = entry.id;
    const changes: any[] = entry.changes ?? [];

    const leadgenChanges = changes.filter(
      (c) => c.field === 'leadgen' && c.value?.leadgen_id && c.value?.form_id,
    );

    // FIX #3 — procesar en lotes de WEBHOOK_CONCURRENCY en lugar de Promise.all ilimitado
    for (let i = 0; i < leadgenChanges.length; i += WEBHOOK_CONCURRENCY) {
      const batch = leadgenChanges.slice(i, i + WEBHOOK_CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (change) => {
          const leadgenId = change.value.leadgen_id;
          const formId    = change.value.form_id;

          // Log del evento
          await this.logRepo.save(
            this.logRepo.create({
              page_id:    pageId,
              event_type: 'leadgen',
              leadgen_id: leadgenId,
              status:     WebhookLogStatus.OK,
              remote_ip:  remoteIp ?? null,
            }),
          ).catch((err) => this.logger.warn(`[LeadProcessor] log error: ${err.message}`));

          await this.processLead(pageId, formId, leadgenId).catch((err) =>
            this.logger.error(`[LeadProcessor] error ${leadgenId}: ${err.message}`),
          );
        }),
      );
    }
  }

  // ─── Procesar un lead individual ─────────────────────────────────────

  async processLead(pageId: string, formId: string, leadgenId: string): Promise<MetaLead> {

    // FIX #1 — idempotencia con INSERT + catch ER_DUP_ENTRY en lugar de SELECT previo
    // Intentar insertar directamente y manejar el duplicado
    let lead: MetaLead;

    // Buscar form_config
    // FIX #1 — cargar page_token explícitamente via QueryBuilder
    const formConfig = await this.formRepo
      .createQueryBuilder('fc')
      .leftJoinAndSelect('fc.page_config', 'pc')
      .addSelect('pc.page_token')
      .where('fc.page_id = :pageId AND fc.form_id = :formId AND fc.is_active = 1', { pageId, formId })
      .getOne();

    if (!formConfig) {
      this.logger.warn(`[LeadProcessor] sin form_config page=${pageId} form=${formId} — skipping`);
      try {
        return await this.leadRepo.save(
          this.leadRepo.create({
            leadgen_id: leadgenId, page_id: pageId, form_id: formId,
            account_id: 0, form_config_id: null,
            status: MetaLeadStatus.SKIPPED,
            error_message: 'form_config no encontrado o inactivo',
          }),
        );
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return this.leadRepo.findOne({ where: { leadgen_id: leadgenId } });
        }
        throw err;
      }
    }

    // FIX #13 — verificar que page_config fue cargada correctamente
    if (!formConfig.page_config) {
      this.logger.error(`[LeadProcessor] form_config ${formConfig.id} sin page_config cargado`);
      throw new Error('page_config no disponible en form_config');
    }

    const pageConfig = formConfig.page_config;

    // Si ya existe (reintento, o entrega duplicada del webhook) reusar la
    // fila en vez de tratarla siempre como "ignorar" — solo se descarta si
    // ya quedó PROCESSED (evita duplicar oportunidades); si quedó
    // FAILED/PENDING/SKIPPED sí se reprocesa.
    const existingLead = await this.leadRepo.findOne({ where: { leadgen_id: leadgenId } });
    if (existingLead) {
      if (existingLead.status === MetaLeadStatus.PROCESSED) {
        this.logger.warn(`[LeadProcessor] ${leadgenId} ya fue procesado — ignorando duplicado`);
        return existingLead;
      }
      lead = existingLead;
    } else {
      try {
        lead = await this.leadRepo.save(
          this.leadRepo.create({
            leadgen_id: leadgenId, page_id: pageId, form_id: formId,
            account_id: formConfig.account_id, form_config_id: formConfig.id,
            status: MetaLeadStatus.PENDING,
          }),
        );
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          // Carrera con otro proceso concurrente insertando el mismo leadgen_id
          lead = await this.leadRepo.findOne({ where: { leadgen_id: leadgenId } });
        } else {
          throw err;
        }
      }
    }

    // FIX #8 — contador con log explícito en lugar de .catch(() => {})
    await this.incrementCounter(formConfig.id, 'leads_total');

    try {
      // Obtener datos del lead con timeout desde GraphApiService
      const graphData = await this.graphApi.getLead(leadgenId, pageConfig.page_token);
      const fields    = this.graphApi.flattenFields(graphData.field_data ?? []);

      await this.leadRepo.update(lead.id, {
        raw_data:      graphData as any,
        campaign_id:   graphData.campaign_id   ?? null,
        campaign_name: graphData.campaign_name ?? null,
        ad_id:         graphData.ad_id         ?? null,
        ad_name:       graphData.ad_name       ?? null,
      });

      const mapped = this.applyMapping(fields, formConfig.field_mapping ?? {});
      const client = await this.usersClient.resolveOrCreateClient(formConfig.account_id, {
        ...this.extractName(fields),
        email: fields.email        ?? mapped.email ?? null,
        phone: fields.phone_number ?? fields.phone  ?? mapped.phone ?? null,
      });
      const opportunityId = await this.createOpportunity(formConfig, mapped, graphData, fields, client);

      await this.leadRepo.update(lead.id, {
        status:         MetaLeadStatus.PROCESSED,
        opportunity_id: opportunityId,
        processed_at:   new Date(),
      });
      await this.incrementCounter(formConfig.id, 'leads_processed');

      this.logger.log(`[LeadProcessor] ${leadgenId} → oportunidad ${opportunityId}`);
      return { ...lead, status: MetaLeadStatus.PROCESSED, opportunity_id: opportunityId } as MetaLead;

    } catch (err) {
      await this.leadRepo.update(lead.id, {
        status:        MetaLeadStatus.FAILED,
        error_message: err.message,
      });
      await this.incrementCounter(formConfig.id, 'leads_failed');
      throw err;
    }
  }

  // ─── Retry ───────────────────────────────────────────────────────────

  async retryLead(leadId: string, accountId: number): Promise<MetaLead> {
    const lead = await this.leadRepo.findOne({ where: { id: leadId, account_id: accountId } });
    if (!lead)                                    throw new Error('Lead no encontrado');
    if (lead.status === MetaLeadStatus.PROCESSED) throw new Error('Lead ya fue procesado');

    // FIX #10 — guard para evitar contador negativo: solo decrementar si > 0
    if (lead.status === MetaLeadStatus.FAILED && lead.form_config_id) {
      const form = await this.formRepo.findOne({ where: { id: lead.form_config_id } });
      if (form && form.leads_failed > 0) {
        await this.formRepo.decrement({ id: lead.form_config_id }, 'leads_failed', 1)
          .catch((err) => this.logger.error(`[Counter] decrement failed: ${err.message}`));
      }
    }

    await this.leadRepo.update(lead.id, {
      status: MetaLeadStatus.PENDING, error_message: null, processed_at: null,
    });

    return this.processLead(lead.page_id, lead.form_id, lead.leadgen_id);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  /** FIX #8 — log explícito si el contador falla */
  private async incrementCounter(
    formConfigId: string,
    field: 'leads_total' | 'leads_processed' | 'leads_failed',
  ): Promise<void> {
    try {
      await this.formRepo.increment({ id: formConfigId }, field, 1);
    } catch (err) {
      this.logger.error(`[Counter] increment ${field} en ${formConfigId}: ${err.message}`);
    }
  }

  private applyMapping(
    fields: Record<string, string>,
    mapping: Record<string, string>,
  ): Record<string, string> {
    if (!Object.keys(mapping).length) return { ...fields };
    const result: Record<string, string> = {};
    for (const [metaKey, cereazKey] of Object.entries(mapping)) {
      if (fields[metaKey] !== undefined) result[cereazKey] = fields[metaKey];
    }
    return result;
  }

  /** "Juan Carlos Pérez" → { firstName: "Juan", lastName: "Carlos Pérez" } */
  private extractName(fields: Record<string, string>): { firstName?: string; lastName?: string } {
    if (fields.first_name || fields.last_name) {
      return { firstName: fields.first_name || undefined, lastName: fields.last_name || undefined };
    }
    const full = fields.full_name?.trim();
    if (!full) return {};
    const [firstName, ...rest] = full.split(/\s+/);
    return { firstName, lastName: rest.join(' ') || undefined };
  }

  private async createOpportunity(
    formConfig: MetaFormConfig,
    mapped: Record<string, string>,
    graphData: any,
    rawFields: Record<string, string>,
    client: { id: string; snapshot: Record<string, any> },
  ): Promise<string> {
    const title = mapped.title
      ?? [rawFields.full_name, rawFields.first_name, rawFields.last_name]
          .filter(Boolean).join(' ')
      ?? `Lead Meta Ads ${new Date().toISOString()}`;

    // Nombres de campo alineados con CreateLeadDto real de ms_opportunities
    // (origin/origin_ref_id/client_snapshot/external_metadata no existen ahí
    // — con whitelist:true se descartaban en silencio; created_by es
    // obligatorio y faltaba, así que cada request fallaba con 400).
    // contact_snapshot es el JSON real del cliente en ms_users_, no uno
    // armado a mano — por eso pasa por UsersClientService antes.
    const payload = {
      title,
      pipeline_id:      formConfig.target_pipeline_id,
      stage_id:         formConfig.target_stage_id,
      assigned_user_id: formConfig.default_agent_id ?? undefined,
      source:           'meta_ads',
      source_ref_id:    graphData.id,
      created_by:       'system',
      metadata: {
        page_id:       formConfig.page_id,  form_id:       formConfig.form_id,
        ad_id:         graphData.ad_id,     ad_name:       graphData.ad_name,
        campaign_id:   graphData.campaign_id, campaign_name: graphData.campaign_name,
        adset_id:      graphData.adset_id,  adset_name:    graphData.adset_name,
      },
      contact_id:       client.id,
      contact_snapshot: client.snapshot,
      description: Object.entries(rawFields).map(([k, v]) => `${k}: ${v}`).join('\n'),
    };

    try {
      // FIX #4 — timeout en llamada a ms_opportunities
      const resp = await firstValueFrom(
        this.http.post<{ id: string }>(
          `${this.oppUrl}/leads`,
          payload,
          {
            // AccountHeaderGuard de ms_opportunities exige el header "account"
            // a secas, no "x-account-id"
            headers: { account: String(formConfig.account_id), 'Content-Type': 'application/json' },
            timeout: OPP_TIMEOUT_MS,
          },
        ),
      );
      return resp.data.id;
    } catch (err) {
      const msg = err?.response?.data?.message ?? err.message;
      throw new Error(`ms_opportunities error: ${msg}`);
    }
  }
}
