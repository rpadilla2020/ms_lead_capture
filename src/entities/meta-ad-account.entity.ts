import {
  BeforeInsert, Column, CreateDateColumn, Entity,
  Index, JoinColumn, ManyToOne, OneToMany,
  PrimaryColumn, UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';
import { MetaPageConfig } from './meta-page-config.entity';
import { MetaCampaign } from './meta-campaign.entity';

@Entity('meta_ad_account')
@Index('idx_maa_account', ['account_id'])
@Index(['account_id', 'ad_account_id'], { unique: true })
export class MetaAdAccount {
  @PrimaryColumn({ type: 'char', length: 26 })
  id: string;

  @BeforeInsert()
  generateId() { if (!this.id) this.id = ulid(); }

  @Column({ type: 'int' })
  account_id: number;

  @Column({ type: 'char', length: 26 })
  page_config_id: string;

  /** ID de la cuenta publicitaria en Meta: act_XXXXXXXXX */
  @Column({ type: 'varchar', length: 32 })
  ad_account_id: string;

  @Column({ type: 'varchar', length: 128 })
  ad_account_name: string;

  @Column({ type: 'tinyint', default: 1 })
  is_active: boolean;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  synced_at: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updated_at: Date;

  @ManyToOne(() => MetaPageConfig, (p) => p.ad_accounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'page_config_id' })
  page_config: MetaPageConfig;

  @OneToMany(() => MetaCampaign, (c) => c.ad_account)
  campaigns: MetaCampaign[];
}
