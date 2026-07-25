import {
  BeforeInsert, Column, CreateDateColumn, Entity,
  Index, PrimaryColumn, UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';

/**
 * Long-lived user token de Meta, uno por account_id. Necesario porque
 * varios edges de Graph API (adaccounts, campaigns) solo aceptan el token
 * del usuario que autorizó — el page_token no alcanza.
 */
@Entity('meta_user_token')
@Index(['account_id'], { unique: true })
export class MetaUserToken {
  @PrimaryColumn({ type: 'char', length: 26 })
  id: string;

  @BeforeInsert()
  generateId() { if (!this.id) this.id = ulid(); }

  @Column({ type: 'int' })
  account_id: number;

  @Column({ type: 'varchar', length: 512, select: false })
  user_token: string;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  expires_at: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updated_at: Date;
}
