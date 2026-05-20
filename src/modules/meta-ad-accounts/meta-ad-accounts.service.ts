import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetaAdAccount } from '../../entities/meta-ad-account.entity';
import { MetaPageConfig } from '../../entities/meta-page-config.entity';
import { GraphApiService } from '../graph-api/graph-api.service';

@Injectable()
export class MetaAdAccountsService {
  private readonly logger = new Logger(MetaAdAccountsService.name);

  constructor(
    @InjectRepository(MetaAdAccount)
    private readonly repo: Repository<MetaAdAccount>,
    @InjectRepository(MetaPageConfig)
    private readonly pageRepo: Repository<MetaPageConfig>,
    private readonly graphApi: GraphApiService,
  ) {}

  async syncFromGraphApi(pageConfigId: string, accountId: number): Promise<MetaAdAccount[]> {
    // FIX #1 — cargar page_token explícitamente (select:false en entidad)
    const page = await this.pageRepo
      .createQueryBuilder('p')
      .addSelect('p.page_token')
      .where('p.id = :id AND p.account_id = :accountId AND p.is_active = 1', { id: pageConfigId, accountId })
      .getOne();
    if (!page) throw new NotFoundException('Página no encontrada o inactiva');

    const adAccounts = await this.graphApi.getPageAdAccounts(page.page_id, page.page_token);
    if (!adAccounts.length) {
      this.logger.warn(`[AdAccounts] Sin ad accounts para página ${page.page_id}`);
      return [];
    }

    const saved: MetaAdAccount[] = [];
    for (const aa of adAccounts) {
      let entity = await this.repo.findOne({
        where: { account_id: accountId, ad_account_id: aa.id },
      });

      if (entity) {
        await this.repo.update(entity.id, {
          ad_account_name: aa.name,
          synced_at:       new Date(),
          is_active:       aa.account_status === 1,
        });
        entity = await this.repo.findOne({ where: { id: entity.id } });
      } else {
        entity = await this.repo.save(
          this.repo.create({
            account_id:      accountId,
            page_config_id:  pageConfigId,
            ad_account_id:   aa.id,
            ad_account_name: aa.name,
            is_active:       aa.account_status === 1,
            synced_at:       new Date(),
          }),
        );
      }

      saved.push(entity);
      this.logger.log(`[AdAccounts] Sync OK — ${aa.id} (${aa.name})`);
    }

    return saved;
  }

  async findAll(accountId: number, pageConfigId?: string): Promise<MetaAdAccount[]> {
    const where: any = { account_id: accountId };
    if (pageConfigId) where.page_config_id = pageConfigId;
    return this.repo.find({ where, order: { created_at: 'DESC' } });
  }

  async findOne(id: string, accountId: number): Promise<MetaAdAccount> {
    const aa = await this.repo.findOne({
      where:    { id, account_id: accountId },
      relations: ['campaigns'],
    });
    if (!aa) throw new NotFoundException('Ad Account no encontrado');
    return aa;
  }
}
