import {
  BeforeInsert, Column, CreateDateColumn, Entity,
  Index, OneToMany, PrimaryColumn, UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';
import { MetaFormConfig } from './meta-form-config.entity';
import { MetaAdAccount }  from './meta-ad-account.entity';

@Entity('meta_page_config')
@Index('idx_mpc_account', ['account_id'])
@Index('idx_mpc_page',    ['page_id'])
@Index(['account_id', 'page_id'], { unique: true })
export class MetaPageConfig {
  @PrimaryColumn({ type: 'char', length: 26 })
  id: string;

  @BeforeInsert()
  generateId() { if (!this.id) this.id = ulid(); }

  @Column({ type: 'int' })
  account_id: number;

  @Column({ type: 'varchar', length: 64 })
  page_id: string;

  @Column({ type: 'varchar', length: 128 })
  page_name: string;

  /**
   * Token de acceso de larga duración — NUNCA expuesto en respuestas API.
   * select:false lo excluye de todos los findOne/find por defecto.
   * Para leerlo explícitamente usar addSelect('entity.page_token').
   */
  @Column({ type: 'text', select: false })
  page_token: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  socialcc_channel_id: string | null;

  /** Timestamp de expiración del token (Meta: ~60 días) */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  token_expires_at: Date | null;

  /** Si la página está suscrita al evento leadgen del webhook */
  @Column({ type: 'tinyint', default: 0 })
  is_webhook_subscribed: boolean;

  @Column({ type: 'tinyint', default: 1 })
  is_active: boolean;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  synced_at: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updated_at: Date;

  @OneToMany(() => MetaFormConfig, (f) => f.page_config)
  form_configs: MetaFormConfig[];

  @OneToMany(() => MetaAdAccount, (a) => a.page_config)
  ad_accounts: MetaAdAccount[];
}
