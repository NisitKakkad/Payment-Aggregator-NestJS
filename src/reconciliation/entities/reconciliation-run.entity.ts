import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ExternalPayoutRecord } from './external-payout-record.entity.js';
import { ReconciliationDiscrepancy } from './reconciliation-discrepancy.entity.js';

export enum ReconciliationRunStatus {
  COMPLETED = 'COMPLETED',
  COMPLETED_WITH_DISCREPANCIES = 'COMPLETED_WITH_DISCREPANCIES',
}

@Entity('reconciliation_runs')
@Index(['merchantId', 'createdAt'])
export class ReconciliationRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  merchantId: string;

  @Column({
    type: 'enum',
    enum: ReconciliationRunStatus,
    default: ReconciliationRunStatus.COMPLETED,
  })
  status: ReconciliationRunStatus;

  @Column({ type: 'int', default: 0 })
  totalRecords: number;

  @Column({ type: 'int', default: 0 })
  matchedRecords: number;

  @Column({ type: 'int', default: 0 })
  discrepancyCount: number;

  @Column({ type: 'bigint', default: '0' })
  totalExternalAmount: string;

  @Column({ type: 'timestamp', nullable: true })
  periodStart: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  periodEnd: Date | null;

  @OneToMany(() => ExternalPayoutRecord, (record) => record.run)
  records: ExternalPayoutRecord[];

  @OneToMany(() => ReconciliationDiscrepancy, (discrepancy) => discrepancy.run)
  discrepancies: ReconciliationDiscrepancy[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
