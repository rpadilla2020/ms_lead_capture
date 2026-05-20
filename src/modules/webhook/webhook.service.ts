import {
  BadRequestException, Injectable, Logger, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { MetaWebhookLog, WebhookLogStatus } from '../../entities/meta-webhook-log.entity';
import { LeadProcessorService } from '../lead-processor/lead-processor.service';

@Injectable()
export class WebhookService {
  private readonly logger      = new Logger(WebhookService.name);
  private readonly verifyToken = process.env.META_VERIFY_TOKEN ?? 'cereza_meta_verify';
  private readonly appSecret   = process.env.META_APP_SECRET   ?? '';

  constructor(
    private readonly processor: LeadProcessorService,
    @InjectRepository(MetaWebhookLog)
    private readonly logRepo: Repository<MetaWebhookLog>,
  ) {}

  // ── GET /webhook/meta ── verificación de Facebook ─────────────────────

  verify(query: Record<string, string>): string {
    const mode      = query['hub.mode'];
    const token     = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === this.verifyToken) {
      this.logger.log('[Webhook] Verificación de Facebook exitosa');
      return challenge;
    }

    this.logger.warn('[Webhook] Verificación fallida — token inválido');
    throw new UnauthorizedException('Verify token inválido');
  }

  // ── POST /webhook/meta ── recepción de eventos ─────────────────────────

  async handleEvent(
    rawBody: Buffer,
    signature: string,
    payload: any,
    remoteIp?: string,
  ): Promise<{ received: boolean }> {
    // Verificar firma
    if (this.appSecret) {
      try {
        this.verifySignature(rawBody, signature);
      } catch (err) {
        await this.logRepo.save(
          this.logRepo.create({
            account_id:    null, // desconocido si la firma es inválida
            page_id:       payload?.entry?.[0]?.id ?? null,
            event_type:    'leadgen',
            leadgen_id:    null,
            status:        WebhookLogStatus.INVALID,
            error_message: err.message,
            remote_ip:     remoteIp ?? null,
          }),
        );
        throw err;
      }
    } else {
      this.logger.warn('[Webhook] META_APP_SECRET no configurado — omitiendo verificación de firma');
    }

    if (payload?.object !== 'page') {
      this.logger.warn(`[Webhook] objeto inesperado: ${payload?.object}`);
      return { received: true };
    }

    const entries: any[] = payload?.entry ?? [];
    this.logger.log(`[Webhook] Recibidos ${entries.length} entry(s) — IP: ${remoteIp}`);

    // Procesar asíncronamente — responder a Meta de inmediato
    setImmediate(() => {
      Promise.all(
        entries.map((e) => this.processor.processWebhookEvent(e, remoteIp)),
      ).catch((err) =>
        this.logger.error(`[Webhook] Error procesando entries: ${err.message}`),
      );
    });

    return { received: true };
  }

  // ── Verificación HMAC SHA-256 ─────────────────────────────────────────

  private verifySignature(rawBody: Buffer, signature: string): void {
    if (!signature?.startsWith('sha256=')) {
      throw new BadRequestException('Firma x-hub-signature-256 ausente o inválida');
    }

    const expected = 'sha256=' + crypto
      .createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);

    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      this.logger.error('[Webhook] Firma inválida — posible solicitud falsa');
      throw new UnauthorizedException('Firma de webhook inválida');
    }
  }
}
