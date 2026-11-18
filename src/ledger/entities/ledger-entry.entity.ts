import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

import { LedgerAccount } from './ledger-account.entity.js';
import { LedgerJournal } from './ledger-journal.entity.js';

export enum LedgerEntryType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

@Entity('ledger_entries')
@Index(['journalId'])
@Index(['accountId', 'createdAt'])
@Index(['referenceType', 'referenceId'])
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  journalId: string;

  @ManyToOne(() => LedgerJournal, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'journalId' })
  journal: LedgerJournal;

  @Column({ type: 'uuid' })
  accountId: string;

  @ManyToOne(() => LedgerAccount, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'accountId' })
  account: LedgerAccount;

  @Column({
    type: 'enum',
    enum: LedgerEntryType,
  })
  type: LedgerEntryType;

  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 50 })
  referenceType: string;

  @Column({ type: 'uuid' })
  referenceId: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
