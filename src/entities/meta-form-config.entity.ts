import {
  BeforeInsert, Column, CreateDateColumn, Entity,
  Index, JoinColumn, ManyToOne, OneToMany,
  PrimaryColumn, UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';
import { MetaPageConfig } from './meta-page-config.entity';
import { MetaLead }       from './meta-lead.entity';

@Entity('meta_form_config')
@Index('idx_mfc_account', ['account_id'])
@Index(['account_id', 'page_id', 'form_id'], { unique: true })
export class MetaFormConfig {
  @PrimaryColumn({ type: 'char', length: 26 })
  id: string;

  @BeforeInsert()
  generateId() { if (!this.id) this.id = ulid(); }

  @Column({ type: 'int' })
  account_id: number;

  @Column({ type: 'char', length: 26 })
  page_config_id: string;

  @Column({ type: 'varchar', length: 64 })
  page_id: string;

  @Column({ type: 'varchar', length: 64 })
  form_id: string;

  @Column({ type: 'varchar', length: 128 })
  form_name: string;

  @Column({ type: 'char', length: 26 })
  target_pipeline_id: string;

  @Column({ type: 'char', length: 26 })
  target_stage_id: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  default_agent_id: string | null;

  /**
   * Mapeo de campos del formulario de Meta hacia campos de Cereza.
   * Ejemplo: { "full_name": "title", "email": "email", "phone_number": "phone" }
   */
  @Column({ type: 'json', nullable: true })
  field_mapping: Record<string, string> | null;

  /** Contadores desnormalizados — actualizados por LeadProcessorService */
  @Column({ type: 'int', default: 0 })
  leads_total: number;

  @Column({ type: 'int', default: 0 })
  leads_processed: number;

  @Column({ type: 'int', default: 0 })
  leads_failed: number;

  @Column({ type: 'tinyint', default: 1 })
  is_active: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updated_at: Date;

  @ManyToOne(() => MetaPageConfig, (p) => p.form_configs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'page_config_id' })
  page_config: MetaPageConfig;

  @OneToMany(() => MetaLead, (l) => l.form_config)
  leads: MetaLead[];
}
