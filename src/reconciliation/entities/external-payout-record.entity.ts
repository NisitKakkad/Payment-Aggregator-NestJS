import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne,
  JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import type { ReconciliationRun } from './reconciliation-run.entity.js';

export enum ExternalPayoutRecordStatus {
  MATCHED = 'MATCHED',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  UNMATCHED = 'UNMATCHED',
}

@Entity('external_payout_records')
@Index('UQ_external_payout_merchant_reference', ['merchantId', 'externalReference'], { unique: true })
@Index(['runId'])
export class ExternalPayoutRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  runId: string;

  @ManyToOne('ReconciliationRun', (run: ReconciliationRun) => run.records, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'runId' })
  run: ReconciliationRun;

  @Column({ type: 'uuid' })
  merchantId: string;

  @Column({ type: 'varchar', length: 150 })
  externalReference: string;

  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'timestamp' })
  transactionDate: Date;

  @Column({ type: 'uuid', nullable: true })
  settlementId: string | null;

  @Column({ type: 'enum', enum: ExternalPayoutRecordStatus, default: ExternalPayoutRecordStatus.UNMATCHED })
  status: ExternalPayoutRecordStatus;

  @CreateDateColumn()
  createdAt: Date;
}
