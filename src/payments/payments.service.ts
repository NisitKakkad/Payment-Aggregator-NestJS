import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { Payment, PaymentStatus } from './entities/payment.entity.js';

import { Order, OrderStatus } from '../orders/entities/order.entity.js';

import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { SimulatedProviderService } from './providers/simulated-provider.service.js';
import { WebhooksService } from '../webhooks/webhooks.service.js';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly simulatedProvider: SimulatedProviderService,
    private readonly webhooksService: WebhooksService,
    @InjectQueue('webhook-delivery')
private readonly webhookQueue: Queue,
  ) {}

  async create(
    merchantId: string,
    dto: CreatePaymentDto,
    idempotencyKey: string,
  ) {
    const order = await this.orderRepository.findOne({
      where: {
        id: dto.orderId,
        merchantId,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const existingPayment = await this.paymentRepository.findOne({
      where: { idempotencyKey },
    });

    if (existingPayment) {
      if (existingPayment.orderId !== dto.orderId) {
        throw new ConflictException(
          'Idempotency key already used for another order',
        );
      }

      return {
        message: 'Payment already exists for this idempotency key',
        payment: {
          id: existingPayment.id,
          orderId: existingPayment.orderId,
          amount: existingPayment.amount,
          currency: existingPayment.currency,
          status: existingPayment.status,
          providerReference: existingPayment.providerReference,
        },
      };
    }

    if (
      order.status === OrderStatus.PAID ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new ConflictException('Payment cannot be initiated for this order');
    }

    // Create payment attempt.
    const payment = this.paymentRepository.create({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: PaymentStatus.PENDING,
      idempotencyKey,
    });

    let savedPayment: Payment;

    try {
      savedPayment = await this.paymentRepository.save(payment);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as any).driverError?.code === '23505'
      ) {
        const duplicatePayment = await this.paymentRepository.findOne({
          where: { idempotencyKey },
        });

        if (duplicatePayment) {
          if (duplicatePayment.orderId !== dto.orderId) {
            throw new ConflictException(
              'Idempotency key already used for another order',
            );
          }
          return {
            message: 'Payment already exists for this idempotency key',
            payment: {
              id: duplicatePayment.id,
              orderId: duplicatePayment.orderId,
              amount: duplicatePayment.amount,
              currency: duplicatePayment.currency,
              status: duplicatePayment.status,
              providerReference: duplicatePayment.providerReference,
            },
          };
        }
      }

      throw error;
    }

    // Process payment through simulated provider.
    const providerResult = await this.simulatedProvider.processPayment();

    // Update payment record.
    savedPayment.providerReference = providerResult.providerReference;

    savedPayment.status =
      providerResult.status === 'SUCCESS'
        ? PaymentStatus.SUCCESS
        : PaymentStatus.FAILED;

    await this.paymentRepository.save(savedPayment);

    // Update order only after successful payment.
    if (savedPayment.status === PaymentStatus.SUCCESS) {
      order.status = OrderStatus.PAID;
      await this.orderRepository.save(order);
    }

    // Generate webhook event.
    const event =
      savedPayment.status === PaymentStatus.SUCCESS
        ? 'payment.success'
        : 'payment.failed';

    const payload = {
      event,
      payment: {
        id: savedPayment.id,
        orderId: savedPayment.orderId,
        amount: savedPayment.amount,
        currency: savedPayment.currency,
        status: savedPayment.status,
        providerReference: savedPayment.providerReference,
      },
    };

    const webhook = await this.webhooksService.createEvent(
  merchantId,
  savedPayment.id,
  event,
  payload,
);

await this.webhookQueue.add(
  'deliver-webhook',
  {
    webhookId: webhook.id,
  },
  {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
);

    return {
      message: 'Payment processed',
      payment: {
        id: savedPayment.id,
        orderId: savedPayment.orderId,
        amount: savedPayment.amount,
        currency: savedPayment.currency,
        status: savedPayment.status,
        providerReference: savedPayment.providerReference,
      },
    };
  }
  async findOne(merchantId: string, paymentId: string) {
    const payment = await this.paymentRepository.findOne({
      where: {
        id: paymentId,
        order: {
          merchantId,
        },
      },
      relations: {
        order: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return {
      id: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      providerReference: payment.providerReference,
      createdAt: payment.createdAt,
    };
  }
  async findAll(merchantId: string, page: number, limit: number) {
    const [payments, total] = await this.paymentRepository.findAndCount({
      where: {
        order: {
          merchantId,
        },
      },
      relations: {
        order: true,
      },
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: payments.map((payment) => ({
        id: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        providerReference: payment.providerReference,
        createdAt: payment.createdAt,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
