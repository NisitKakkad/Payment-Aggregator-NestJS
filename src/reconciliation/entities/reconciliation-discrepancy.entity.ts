import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne,
  JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import type { ReconciliationRun } from './reconciliation-run.entity.js';

export enum ReconciliationDiscrepancyType {
  UNMATCHED_EXTERNAL_RECORD = 'UNMATCHED_EXTERNAL_RECORD',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  MISSING_EXTERNAL_RECORD = 'MISSING_EXTERNAL_RECORD',
}

export enum ReconciliationDiscrepancyStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}

@Entity('reconciliation_discrepancies')
@Index(['runId', 'status'])
export class ReconciliationDiscrepancy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  runId: string;

  @ManyToOne('ReconciliationRun', (run: ReconciliationRun) => run.discrepancies, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'runId' })
  run: ReconciliationRun;

  @Column({ type: 'uuid', nullable: true })
  externalPayoutRecordId: string | null;

  @Column({ type: 'uuid', nullable: true })
  settlementId: string | null;

  @Column({ type: 'enum', enum: ReconciliationDiscrepancyType })
  type: ReconciliationDiscrepancyType;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ type: 'bigint', nullable: true })
  expectedAmount: string | null;

  @Column({ type: 'bigint', nullable: true })
  actualAmount: string | null;

  @Column({ type: 'enum', enum: ReconciliationDiscrepancyStatus, default: ReconciliationDiscrepancyStatus.OPEN })
  status: ReconciliationDiscrepancyStatus;

  @CreateDateColumn()
  createdAt: Date;
}
