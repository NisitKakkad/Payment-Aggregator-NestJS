import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne,
  JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import type { Settlement } from './settlements.entity.js';

@Entity('settlement_items')
@Index(['settlementId'])
export class SettlementItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  settlementId: string;

  @ManyToOne('Settlement', (settlement: Settlement) => settlement.items, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'settlementId' })
  settlement: Settlement;

  // A settlement item is a snapshot of the net payable amount reserved by this settlement.
  @Column({ type: 'varchar', length: 50, default: 'NET_MERCHANT_PAYABLE' })
  itemType: string;

  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
