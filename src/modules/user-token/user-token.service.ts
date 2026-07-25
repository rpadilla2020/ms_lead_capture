import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetaUserToken } from '../../entities/meta-user-token.entity';

@Injectable()
export class UserTokenService {
  constructor(
    @InjectRepository(MetaUserToken)
    private readonly repo: Repository<MetaUserToken>,
  ) {}

  async upsert(accountId: number, token: string, expiresAt: Date | null): Promise<void> {
    const existing = await this.repo.findOne({ where: { account_id: accountId } });
    if (existing) {
      await this.repo.update(existing.id, { user_token: token, expires_at: expiresAt });
    } else {
      await this.repo.save(
        this.repo.create({ account_id: accountId, user_token: token, expires_at: expiresAt }),
      );
    }
  }

  async getToken(accountId: number): Promise<string | null> {
    const row = await this.repo
      .createQueryBuilder('t')
      .addSelect('t.user_token')
      .where('t.account_id = :accountId', { accountId })
      .getOne();
    return row?.user_token ?? null;
  }
}
