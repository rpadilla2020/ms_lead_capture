import {
  BadRequestException, Injectable, Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { MetaPageConfig } from '../../entities/meta-page-config.entity';
import { GraphApiService } from '../graph-api/graph-api.service';

const GRAPH_TIMEOUT = Number(process.env.GRAPH_TIMEOUT_MS ?? 8_000);

export interface OAuthPageResult {
  created: number;
  updated: number;
  skipped: number;
  pages:   Array<{ page_id: string; page_name: string; is_new: boolean }>;
}

@Injectable()
export class FacebookOAuthService {
  private readonly logger      = new Logger(FacebookOAuthService.name);
  private readonly appId       = process.env.META_APP_ID       ?? '';
  private readonly appSecret   = process.env.META_APP_SECRET   ?? '';
  private readonly appToken    = process.env.META_APP_TOKEN    ?? '';
  private readonly version     = process.env.META_GRAPH_VERSION ?? 'v22.0';
  private readonly redirectUri = process.env.META_OAUTH_REDIRECT_URI ?? '';
  private readonly base        = `https://graph.facebook.com/${this.version}`;

  constructor(
    @InjectRepository(MetaPageConfig)
    private readonly repo: Repository<MetaPageConfig>,
    private readonly graphApi: GraphApiService,
    private readonly http: HttpService,
  ) {}

  // ── 1. Generar URL de autorización de Facebook ─────────────────────────

  getAuthUrl(accountId: number): string {
    if (!this.appId) throw new BadRequestException('META_APP_ID no configurado');
    if (!this.redirectUri) throw new BadRequestException('META_OAUTH_REDIRECT_URI no configurado');

    const params = new URLSearchParams({
      client_id:     this.appId,
      redirect_uri:  this.redirectUri,
      scope:         'pages_show_list,pages_read_engagement,leads_retrieval,pages_messaging',
      state:         String(accountId),
      response_type: 'code',
    });

    const url = `https://www.facebook.com/dialog/oauth?${params.toString()}`;
    this.logger.log(`[OAuth] URL generada para account ${accountId}`);
    return url;
  }

  // ── 2. Manejar el callback — intercambiar code por tokens y guardar páginas

  async handleCallback(code: string, state: string): Promise<OAuthPageResult> {
    const accountId = Number(state);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('state inválido — accountId no encontrado');
    }

    this.logger.log(`[OAuth] Callback recibido para account ${accountId}`);

    // Paso 1: code → short-lived user token
    const shortToken = await this.exchangeCodeForToken(code);

    // Paso 2: short-lived → long-lived user token (60 días)
    const longToken = await this.exchangeForLongLivedToken(shortToken);

    // Paso 3: obtener páginas autorizadas por el usuario
    const pages = await this.getAuthorizedPages(longToken);

    if (!pages.length) {
      this.logger.warn(`[OAuth] El usuario no autorizó ninguna página`);
      return { created: 0, updated: 0, skipped: 0, pages: [] };
    }

    // Paso 4: guardar cada página con su propio page token
    const result: OAuthPageResult = { created: 0, updated: 0, skipped: 0, pages: [] };

    for (const fbPage of pages) {
      try {
        await this.upsertPage(accountId, fbPage, result);
      } catch (err) {
        this.logger.error(`[OAuth] Error guardando página ${fbPage.id}: ${err.message}`);
        result.skipped++;
      }
    }

    this.logger.log(
      `[OAuth] Completado — ${result.created} nuevas, ${result.updated} actualizadas, ${result.skipped} omitidas`,
    );

    return result;
  }

  // ── Helpers internos ──────────────────────────────────────────────────────

  /** Intercambia el code por un short-lived user access token */
  private async exchangeCodeForToken(code: string): Promise<string> {
    try {
      const resp = await firstValueFrom(
        this.http.get<{ access_token: string; token_type: string }>(
          `${this.base}/oauth/access_token`,
          {
            params: {
              client_id:     this.appId,
              client_secret: this.appSecret,
              redirect_uri:  this.redirectUri,
              code,
            },
            timeout: GRAPH_TIMEOUT,
          },
        ),
      );
      if (!resp.data?.access_token) throw new Error('No se recibió access_token');
      this.logger.log('[OAuth] Short-lived token obtenido');
      return resp.data.access_token;
    } catch (err) {
      const msg = err?.response?.data?.error?.message ?? err.message;
      throw new BadRequestException(`Error intercambiando code: ${msg}`);
    }
  }

  /** Convierte short-lived en long-lived user token (~60 días) */
  private async exchangeForLongLivedToken(shortToken: string): Promise<string> {
    try {
      const resp = await firstValueFrom(
        this.http.get<{ access_token: string; expires_in: number }>(
          `${this.base}/oauth/access_token`,
          {
            params: {
              grant_type:        'fb_exchange_token',
              client_id:         this.appId,
              client_secret:     this.appSecret,
              fb_exchange_token: shortToken,
            },
            timeout: GRAPH_TIMEOUT,
          },
        ),
      );
      if (!resp.data?.access_token) throw new Error('No se recibió long-lived token');
      this.logger.log('[OAuth] Long-lived user token obtenido');
      return resp.data.access_token;
    } catch (err) {
      const msg = err?.response?.data?.error?.message ?? err.message;
      throw new BadRequestException(`Error obteniendo long-lived token: ${msg}`);
    }
  }

  /** Obtiene la lista de páginas que el usuario administra con sus page tokens */
  private async getAuthorizedPages(userToken: string): Promise<Array<{
    id: string; name: string; access_token: string; category?: string;
  }>> {
    try {
      const resp = await firstValueFrom(
        this.http.get<{ data: Array<{ id: string; name: string; access_token: string; category?: string }> }>(
          `${this.base}/me/accounts`,
          {
            params: {
              fields:       'id,name,access_token,category',
              access_token: userToken,
            },
            timeout: GRAPH_TIMEOUT,
          },
        ),
      );
      const pages = resp.data?.data ?? [];
      this.logger.log(`[OAuth] ${pages.length} páginas autorizadas por el usuario`);
      return pages;
    } catch (err) {
      const msg = err?.response?.data?.error?.message ?? err.message;
      throw new BadRequestException(`Error obteniendo páginas: ${msg}`);
    }
  }

  /** Upsert de una página en meta_page_config */
  private async upsertPage(
    accountId: number,
    fbPage: { id: string; name: string; access_token: string; category?: string },
    result: OAuthPageResult,
  ): Promise<void> {
    // Verificar token y obtener expiración
    const debug = await this.graphApi.debugToken(fbPage.access_token);

    if (!debug.is_valid) {
      this.logger.warn(`[OAuth] Token inválido para página ${fbPage.id} — omitiendo`);
      result.skipped++;
      return;
    }

    const existing = await this.repo.findOne({
      where: { account_id: accountId, page_id: fbPage.id },
    });

    const data: Partial<MetaPageConfig> = {
      page_token:         fbPage.access_token,
      page_name:          fbPage.name,
      is_active:          true,
      synced_at:          new Date(),
      token_expires_at:   debug.expires_at ?? null,
    };

    const isNew = !existing;

    if (existing) {
      await this.repo.update(existing.id, data);
    } else {
      await this.repo.save(
        this.repo.create({
          account_id: accountId,
          page_id:    fbPage.id,
          ...data,
        }),
      );
    }

    result.pages.push({ page_id: fbPage.id, page_name: fbPage.name, is_new: isNew });
    if (isNew) result.created++; else result.updated++;

    this.logger.log(
      `[OAuth] Página ${isNew ? 'creada' : 'actualizada'}: ${fbPage.id} (${fbPage.name})`,
    );
  }
}
