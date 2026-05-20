import {
  BeforeInsert, Column, CreateDateColumn, Entity,
  Index, JoinColumn, ManyToOne, PrimaryColumn,
} from 'typeorm';
import { ulid } from 'ulid';
import { MetaFormConfig } from './meta-form-config.entity';

export enum MetaLeadStatus {
  PENDING   = 'pending',
  PROCESSED = 'processed',
  FAILED    = 'failed',
  SKIPPED   = 'skipped',
}

@Entity('meta_lead')
@Index('idx_ml_account',  ['account_id'])
@Index('idx_ml_status',   ['status'])
@Index('idx_ml_campaign', ['campaign_id'])
@Index('idx_ml_leadgen',  ['leadgen_id'], { unique: true })
export class MetaLead {
  @PrimaryColumn({ type: 'char', length: 26 })
  id: string;

  @BeforeInsert()
  generateId() { if (!this.id) this.id = ulid(); }

  @Column({ type: 'int' })
  account_id: number;

  @Column({ type: 'varchar', length: 64 })
  leadgen_id: string;

  @Column({ type: 'varchar', length: 64 })
  page_id: string;

  @Column({ type: 'varchar', length: 64 })
  form_id: string;

  @Column({ type: 'char', length: 26, nullable: true })
  form_config_id: string | null;

  /** Campos desnormalizados desde Graph API para queries rápidas */
  @Column({ type: 'varchar', length: 64, nullable: true })
  campaign_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  campaign_name: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ad_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  ad_name: string | null;

  @Column({ type: 'char', length: 26, nullable: true })
  opportunity_id: string | null;

  @Column({ type: 'json', nullable: true })
  raw_data: Record<string, any> | null;

  @Column({
    type: 'enum',
    enum: MetaLeadStatus,
    default: MetaLeadStatus.PENDING,
  })
  status: MetaLeadStatus;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  processed_at: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at: Date;

  @ManyToOne(() => MetaFormConfig, (f) => f.leads, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'form_config_id' })
  form_config: MetaFormConfig;
}
