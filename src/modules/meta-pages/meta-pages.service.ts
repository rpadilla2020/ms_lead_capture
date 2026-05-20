import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { MetaPageConfig } from '../../entities/meta-page-config.entity';
import { GraphApiService } from '../graph-api/graph-api.service';

const SOCIALCC_TIMEOUT_MS = Number(process.env.SOCIALCC_TIMEOUT_MS ?? 8_000);

@Injectable()
export class MetaPagesService {
  private readonly logger      = new Logger(MetaPagesService.name);
  private readonly socialccUrl = process.env.SOCIALCC_INTERNAL_URL ?? 'http://ms_socialcc:3000/api/socialcc';

  constructor(
    @InjectRepository(MetaPageConfig)
    private readonly repo: Repository<MetaPageConfig>,
    private readonly graphApi: GraphApiService,
    private readonly http: HttpService,
  ) {}

  // ── Sync desde ms_socialcc ────────────────────────────────────────────

  async syncFromSocialcc(accountId: number): Promise<MetaPageConfig[]> {
    let channels: any[] = [];
    try {
      // FIX #5 — timeout explícito en llamada a ms_socialcc
      const resp = await firstValueFrom(
        this.http.get(`${this.socialccUrl}/channel/account/${accountId}`, {
          headers: { 'x-account-id': String(accountId) },
          timeout: SOCIALCC_TIMEOUT_MS,
        }),
      );
      channels = Array.isArray(resp.data) ? resp.data : resp.data?.data ?? [];
    } catch (err) {
      throw new BadRequestException(
        `No se pudo conectar con ms_socialcc: ${err.message}`,
      );
    }

    const fbChannels = channels.filter(
      (c: any) => c.provider_account?.type === 'FACEBOOK' && !c.deleted,
    );

    if (!fbChannels.length) {
      this.logger.warn(`[MetaPages] Sin canales Facebook en account ${accountId}`);
      return [];
    }

    const saved: MetaPageConfig[] = [];

    for (const ch of fbChannels) {
      const pageId    = ch.provider_account.id;
      const pageToken = ch.provider_account.key;
      const pageName  = ch.name ?? `Página ${pageId}`;
      const channelId = ch._id?.toString() ?? null;

      // FIX #9 — usar debugToken (1 sola llamada) en lugar de verifyPageToken (1 extra)
      const debug = await this.graphApi.debugToken(pageToken);
      if (!debug.is_valid) {
        this.logger.warn(`[MetaPages] Token inválido para page ${pageId} — omitiendo`);
        continue;
      }

      let page = await this.repo.findOne({
        where: { account_id: accountId, page_id: pageId },
      });

      const updateData: Partial<MetaPageConfig> = {
        page_name:           pageName,
        page_token:          pageToken,
        socialcc_channel_id: channelId,
        synced_at:           new Date(),
        is_active:           true,
        token_expires_at:    debug.expires_at ?? undefined,
      };

      if (page) {
        await this.repo.update(page.id, updateData);
        page = await this.repo.findOne({ where: { id: page.id } });
      } else {
        page = await this.repo.save(this.repo.create({
          account_id: accountId,
          page_id:    pageId,
          ...updateData,
        }));
      }

      saved.push(page);
      this.logger.log(`[MetaPages] Sync OK — page ${pageId} (${pageName})`);
    }

    return saved;
  }

  // ── CRUD — page_token NUNCA incluido en respuestas ────────────────────

  // FIX #10 — paginación en findAll
  async findAll(
    accountId: number,
    page = 1,
    limit = 50,
  ): Promise<{ data: MetaPageConfig[]; total: number }> {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;
    const [data, total] = await this.repo.findAndCount({
      where:    { account_id: accountId },
      order:    { created_at: 'DESC' },
      relations: ['form_configs'],
      take, skip,
    });
    return { data, total };
  }

  async findOne(id: string, accountId: number): Promise<MetaPageConfig> {
    const page = await this.repo.findOne({
      where:    { id, account_id: accountId },
      relations: ['form_configs'],
    });
    if (!page) throw new NotFoundException('Configuración de página no encontrada');
    return page;
  }

  /** Carga la página CON token — solo para uso interno de servicios */
  async findOneWithToken(id: string, accountId: number): Promise<MetaPageConfig> {
    const page = await this.repo
      .createQueryBuilder('p')
      .addSelect('p.page_token')
      .where('p.id = :id AND p.account_id = :accountId', { id, accountId })
      .getOne();
    if (!page) throw new NotFoundException('Página no encontrada');
    return page;
  }

  /** Carga página por page_id CON token — para uso interno */
  async findByPageIdWithToken(pageId: string, accountId: number): Promise<MetaPageConfig | null> {
    return this.repo
      .createQueryBuilder('p')
      .addSelect('p.page_token')
      .where('p.page_id = :pageId AND p.account_id = :accountId AND p.is_active = 1', { pageId, accountId })
      .getOne();
  }

  async toggle(id: string, accountId: number): Promise<MetaPageConfig> {
    const page = await this.findOne(id, accountId);
    await this.repo.update(id, { is_active: !page.is_active });
    return this.findOne(id, accountId);
  }

  async remove(id: string, accountId: number): Promise<void> {
    const page = await this.findOne(id, accountId);
    await this.repo.remove(page);
  }
}
