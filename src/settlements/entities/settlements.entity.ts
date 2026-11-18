import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index, OneToMany,
} from 'typeorm';
import { SettlementItem } from './settlements-item.entity.js';

export enum SettlementStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('settlements')
@Index('UQ_settlements_merchant_idempotency', ['merchantId', 'idempotencyKey'], { unique: true })
@Index(['merchantId', 'createdAt'])
@Index(['merchantId', 'status'])
export class Settlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  merchantId: string;

  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'enum', enum: SettlementStatus, default: SettlementStatus.PENDING })
  status: SettlementStatus;

  @Column({ type: 'varchar', length: 150, nullable: true, unique: true })
  payoutReference: string | null;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @OneToMany(() => SettlementItem, (item) => item.settlement)
  items: SettlementItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
