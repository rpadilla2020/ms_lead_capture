import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { MetaPageConfig }  from '../../entities/meta-page-config.entity';
import { MetaWebhookLog }  from '../../entities/meta-webhook-log.entity';
import { GraphApiService } from '../graph-api/graph-api.service';

const WARNING_DAYS   = Number(process.env.TOKEN_WARNING_DAYS   ?? 10);
const LOG_RETAIN_DAYS = Number(process.env.LOG_RETAIN_DAYS     ?? 90);

@Injectable()
export class TokenMonitorService {
  private readonly logger = new Logger(TokenMonitorService.name);

  constructor(
    @InjectRepository(MetaPageConfig)
    private readonly pageRepo: Repository<MetaPageConfig>,
    @InjectRepository(MetaWebhookLog)
    private readonly logRepo: Repository<MetaWebhookLog>,
    private readonly graphApi: GraphApiService,
  ) {}

  // ── FIX #7 — Cron diario: una sola llamada debugToken por página ─────

  @Cron(process.env.TOKEN_CHECK_CRON ?? '0 8 * * *')
  async checkTokenExpiration(): Promise<void> {
    // FIX #8 — evitar ejecución duplicada en múltiples pods
    // Solo el pod con CRON_MASTER=true ejecuta los jobs
    if (process.env.CRON_MASTER !== 'true') {
      this.logger.debug('[TokenMonitor] Pod no es CRON_MASTER — skip');
      return;
    }
    this.logger.log('[TokenMonitor] Iniciando verificación de tokens...');

    // FIX #1 — cargar page_token explícitamente para el cron
    const pages = await this.pageRepo
      .createQueryBuilder('p')
      .addSelect('p.page_token')
      .where('p.is_active = 1')
      .getMany();

    // Verificar páginas secuencialmente para no saturar el rate limit de Meta
    for (const page of pages) {
      await this.checkPage(page);
      // Pausa mínima entre llamadas para respetar rate limits
      await new Promise((r) => setTimeout(r, 300));
    }

    this.logger.log(`[TokenMonitor] Verificación completada — ${pages.length} páginas`);
  }

  // ── FIX #6 — Cron semanal: limpieza de webhook_log > LOG_RETAIN_DAYS ─

  @Cron(process.env.LOG_CLEANUP_CRON ?? '0 3 * * 0') // cada domingo a las 3am
  async cleanupOldLogs(): Promise<void> {
    // FIX #8 — solo el pod master ejecuta el cleanup
    if (process.env.CRON_MASTER !== 'true') return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOG_RETAIN_DAYS);

    const result = await this.logRepo.delete({ created_at: LessThan(cutoff) });
    this.logger.log(`[TokenMonitor] Cleanup logs: ${result.affected ?? 0} registros eliminados (> ${LOG_RETAIN_DAYS}d)`);
  }

  // ── Verificación manual de una página ────────────────────────────────

  async refreshTokenInfo(pageConfigId: string, accountId: number): Promise<MetaPageConfig> {
    const page = await this.pageRepo
      .createQueryBuilder('p')
      .addSelect('p.page_token')
      .where('p.id = :id AND p.account_id = :accountId', { id: pageConfigId, accountId })
      .getOne();
    if (!page) throw new Error('Página no encontrada');
    await this.checkPage(page);
    return this.pageRepo.findOne({ where: { id: page.id } });
  }

  // ── Suscribir página al webhook de leadgen ───────────────────────────

  async subscribeToWebhook(pageConfigId: string, accountId: number): Promise<MetaPageConfig> {
    const page = await this.pageRepo
      .createQueryBuilder('p')
      .addSelect('p.page_token')
      .where('p.id = :id AND p.account_id = :accountId AND p.is_active = 1', { id: pageConfigId, accountId })
      .getOne();
    if (!page) throw new Error('Página no encontrada o inactiva');

    const success = await this.graphApi.subscribePageToWebhook(page.page_id, page.page_token);
    await this.pageRepo.update(page.id, { is_webhook_subscribed: success });

    this.logger[success ? 'log' : 'error'](
      `[TokenMonitor] Webhook ${success ? 'suscrito' : 'falló'} — page ${page.page_id}`,
    );

    return this.pageRepo.findOne({ where: { id: page.id } });
  }

  // ── Verificar estado de suscripción del webhook ──────────────────────

  async checkWebhookSubscription(
    pageConfigId: string, accountId: number,
  ): Promise<{ is_subscribed: boolean; subscribed_fields: string[] }> {
    const page = await this.pageRepo
      .createQueryBuilder('p')
      .addSelect('p.page_token')
      .where('p.id = :id AND p.account_id = :accountId', { id: pageConfigId, accountId })
      .getOne();
    if (!page) throw new Error('Página no encontrada');

    const fields       = await this.graphApi.getPageWebhookSubscriptions(page.page_id, page.page_token);
    const isSubscribed = fields.includes('leadgen');

    await this.pageRepo.update(page.id, { is_webhook_subscribed: isSubscribed });
    return { is_subscribed: isSubscribed, subscribed_fields: fields };
  }

  // ── Helper: FIX #7 — una sola llamada debugToken ─────────────────────

  private async checkPage(page: MetaPageConfig): Promise<void> {
    try {
      const debug = await this.graphApi.debugToken(page.page_token);

      if (!debug.is_valid) {
        this.logger.error(
          `[TokenMonitor] Token INVÁLIDO — page ${page.page_id} (${page.page_name}) account ${page.account_id}`,
        );
        await this.pageRepo.update(page.id, { is_active: false });
        return;
      }

      const updates: Partial<MetaPageConfig> = {};
      if (debug.expires_at) updates.token_expires_at = debug.expires_at;

      const daysLeft = debug.expires_at
        ? Math.ceil((debug.expires_at.getTime() - Date.now()) / 86_400_000)
        : null;

      if (daysLeft !== null) {
        if (daysLeft <= 0) {
          this.logger.error(`[TokenMonitor] Token EXPIRADO — page ${page.page_id}`);
        } else if (daysLeft <= WARNING_DAYS) {
          this.logger.warn(
            `[TokenMonitor] Token vence en ${daysLeft}d — page ${page.page_id} (${page.page_name})`,
          );
          // TODO: integrar ms_notifications para alertar al admin
        } else {
          this.logger.debug(`[TokenMonitor] Token OK — page ${page.page_id} — ${daysLeft}d restantes`);
        }
      }

      if (Object.keys(updates).length) {
        await this.pageRepo.update(page.id, updates);
      }
    } catch (err) {
      this.logger.error(`[TokenMonitor] Error verificando page ${page.page_id}: ${err.message}`);
    }
  }
}
