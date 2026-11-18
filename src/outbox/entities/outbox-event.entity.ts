import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum OutboxEventStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

@Entity('outbox_events')
@Index(['status', 'createdAt'])
@Index(['eventId'], { unique: true })
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Unique identifier for the business event.
  @Column({
    type: 'uuid',
  })
  eventId: string;

  // Event name, e.g. payment.success or refund.processed.
  @Column({
    type: 'varchar',
    length: 100,
  })
  event: string;

  // Entity that generated the event.
  @Column({
    type: 'varchar',
    length: 50,
  })
  aggregateType: string;

  @Column({
    type: 'uuid',
  })
  aggregateId: string;

  // Merchant associated with the event.
  @Column({
    type: 'uuid',
  })
  merchantId: string;

  // Event data.
  @Column({
    type: 'jsonb',
  })
  payload: Record<string, any>;

  @Column({
    type: 'enum',
    enum: OutboxEventStatus,
    default: OutboxEventStatus.PENDING,
  })
  status: OutboxEventStatus;

  @Column({
    type: 'int',
    default: 0,
  })
  attempts: number;

  @Column({
    type: 'text',
    nullable: true,
  })
  lastError: string | null;

  @Column({
    type: 'timestamp',
    nullable: true,
  })
  processedAt: Date | null;
  @Column({
    type: 'uuid',
    nullable: true,
  })
  webhookId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
