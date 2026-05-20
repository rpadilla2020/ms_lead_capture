import {
  BeforeInsert, Column, CreateDateColumn, Entity,
  Index, PrimaryColumn,
} from 'typeorm';
import { ulid } from 'ulid';

export enum WebhookLogStatus {
  OK      = 'ok',
  INVALID = 'invalid_signature',
  ERROR   = 'error',
}

@Entity('meta_webhook_log')
@Index('idx_mwl_page',   ['page_id'])
@Index('idx_mwl_status', ['status'])
@Index('idx_mwl_created', ['created_at'])
export class MetaWebhookLog {
  @PrimaryColumn({ type: 'char', length: 26 })
  id: string;

  @BeforeInsert()
  generateId() { if (!this.id) this.id = ulid(); }

  @Column({ type: 'int', nullable: true })
  account_id: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  page_id: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  event_type: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  leadgen_id: string | null;

  @Column({
    type: 'enum',
    enum: WebhookLogStatus,
    default: WebhookLogStatus.OK,
  })
  status: WebhookLogStatus;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  /** IP de origen del request */
  @Column({ type: 'varchar', length: 64, nullable: true })
  remote_ip: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at: Date;
}
