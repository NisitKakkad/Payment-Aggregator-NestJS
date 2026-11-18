
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';

import { LedgerEntry } from './ledger-entry.entity.js';

export enum LedgerJournalStatus {
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

@Entity('ledger_journals')
@Index(
  'UQ_ledger_journals_merchant_reference',
  ['merchantId', 'referenceType', 'referenceId'],
  {
    unique: true,
    where: '"merchantId" IS NOT NULL',
  },
)
@Index(
  'UQ_ledger_journals_system_reference',
  ['referenceType', 'referenceId'],
  {
    unique: true,
    where: '"merchantId" IS NULL',
  },
)
@Index(['merchantId', 'createdAt'])
@Index(
  'UQ_ledger_journals_reversal_of',
  ['reversalOfId'],
  {
    unique: true,
    where: '"reversalOfId" IS NOT NULL',
  },
)
export class LedgerJournal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  merchantId: string | null;

  @Column({ type: 'varchar', length: 50 })
  referenceType: string;

  @Column({ type: 'uuid' })
  referenceId: string;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'bigint' })
  totalDebits: string;

  @Column({ type: 'bigint' })
  totalCredits: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: LedgerJournalStatus,
    default: LedgerJournalStatus.POSTED,
  })
  status: LedgerJournalStatus;

  @Column({ type: 'uuid', nullable: true })
  reversalOfId: string | null;

  @OneToMany(
    () => LedgerEntry,
    (entry) => entry.journal,
  )
  entries: LedgerEntry[];

  @CreateDateColumn()
  createdAt: Date;
}
