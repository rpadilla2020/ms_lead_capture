import {
  BeforeInsert, Column, CreateDateColumn, Entity,
  Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';
import { MetaAdAccount } from './meta-ad-account.entity';
import { MetaFormConfig } from './meta-form-config.entity';

export enum MetaCampaignStatus {
  ACTIVE   = 'ACTIVE',
  PAUSED   = 'PAUSED',
  ARCHIVED = 'ARCHIVED',
  DELETED  = 'DELETED',
}

@Entity('meta_campaign')
@Index('idx_mc_account', ['account_id'])
@Index('idx_mc_form', ['form_id'])
@Index(['account_id', 'ad_id'], { unique: true })
export class MetaCampaign {
  @PrimaryColumn({ type: 'char', length: 26 })
  id: string;

  @BeforeInsert()
  generateId() { if (!this.id) this.id = ulid(); }

  @Column({ type: 'int' })
  account_id: number;

  @Column({ type: 'char', length: 26 })
  ad_account_entity_id: string;

  @Column({ type: 'char', length: 26, nullable: true })
  form_config_id: string | null;

  // ── Jerarquía Meta Ads ───────────────────────────────────────────────
  @Column({ type: 'varchar', length: 64 })
  campaign_id: string;

  @Column({ type: 'varchar', length: 200 })
  campaign_name: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  adset_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  adset_name: string | null;

  @Column({ type: 'varchar', length: 64 })
  ad_id: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  ad_name: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  form_id: string | null;

  @Column({
    type: 'enum',
    enum: MetaCampaignStatus,
    default: MetaCampaignStatus.ACTIVE,
  })
  status: MetaCampaignStatus;

  @Column({ type: 'tinyint', default: 1 })
  is_active: boolean;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  synced_at: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updated_at: Date;

  @ManyToOne(() => MetaAdAccount, (a) => a.campaigns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ad_account_entity_id' })
  ad_account: MetaAdAccount;

  @ManyToOne(() => MetaFormConfig, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'form_config_id' })
  form_config: MetaFormConfig;
}
