
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum LedgerAccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export enum LedgerAccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('ledger_accounts')
@Index(
  'UQ_ledger_accounts_system_code',
  ['code'],
  {
    unique: true,
    where: '"merchantId" IS NULL',
  },
)
@Index(
  'UQ_ledger_accounts_merchant_code',
  ['merchantId', 'code'],
  {
    unique: true,
    where: '"merchantId" IS NOT NULL',
  },
)
export class LedgerAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  merchantId: string | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({
    type: 'enum',
    enum: LedgerAccountType,
  })
  type: LedgerAccountType;

  @Column({
    type: 'enum',
    enum: LedgerAccountStatus,
    default: LedgerAccountStatus.ACTIVE,
  })
  status: LedgerAccountStatus;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
