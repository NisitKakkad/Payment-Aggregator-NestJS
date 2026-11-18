import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

import { Payment } from '../../payments/entities/payment.entity.js';

export enum RefundStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('refunds')
@Index(['paymentId'])
@Index(['idempotencyKey'], { unique: true })
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Original payment relationship
  @Column({ type: 'uuid' })
  paymentId: string;

  @ManyToOne(() => Payment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentId' })
  payment: Payment;

  // Refund amount in smallest currency unit (paise)
  @Column({ type: 'bigint' })
  amount: string;

  @Column({
    type: 'varchar',
    length: 3,
  })
  currency: string;

  // Refund lifecycle
  @Column({
    type: 'enum',
    enum: RefundStatus,
    default: RefundStatus.PENDING,
  })
  status: RefundStatus;

  // Simulated payment provider reference
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    unique: true,
  })
  providerRefundReference: string | null;

  // Prevent duplicate refund requests
  @Column({
    type: 'varchar',
    length: 100,
  })
  idempotencyKey: string;

  // Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
