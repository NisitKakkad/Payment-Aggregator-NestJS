import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

import { Payment, PaymentStatus } from './entities/payment.entity.js';

import { Order, OrderStatus } from '../orders/entities/order.entity.js';

import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { SimulatedProviderService } from './providers/simulated-provider.service.js';
import { OutboxService } from '../outbox/outbox.service.js';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    private readonly simulatedProvider: SimulatedProviderService,

    private readonly dataSource: DataSource,

    private readonly outboxService: OutboxService,
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

    const paymentStatus =
      providerResult.status === 'SUCCESS'
        ? PaymentStatus.SUCCESS
        : PaymentStatus.FAILED;

    // Atomically persist payment result, order update and outbox event.
    const finalizedPayment = await this.dataSource.transaction(
      async (manager) => {
        const paymentRepo = manager.getRepository(Payment);
        const orderRepo = manager.getRepository(Order);

        const paymentToUpdate = await paymentRepo.findOne({
          where: { id: savedPayment.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!paymentToUpdate) {
          throw new NotFoundException('Payment not found');
        }

        paymentToUpdate.providerReference = providerResult.providerReference;

        paymentToUpdate.status = paymentStatus;

        const updatedPayment = await paymentRepo.save(paymentToUpdate);

        // Update order only after successful payment.
        if (updatedPayment.status === PaymentStatus.SUCCESS) {
          const orderToUpdate = await orderRepo.findOne({
            where: {
              id: updatedPayment.orderId,
              merchantId,
            },
            lock: { mode: 'pessimistic_write' },
          });

          if (!orderToUpdate) {
            throw new NotFoundException('Order not found');
          }

          orderToUpdate.status = OrderStatus.PAID;

          await orderRepo.save(orderToUpdate);
        }

        const event =
          updatedPayment.status === PaymentStatus.SUCCESS
            ? 'payment.success'
            : 'payment.failed';

        const payload = {
          event,
          payment: {
            id: updatedPayment.id,
            orderId: updatedPayment.orderId,
            amount: updatedPayment.amount,
            currency: updatedPayment.currency,
            status: updatedPayment.status,
            providerReference: updatedPayment.providerReference,
          },
        };

        await this.outboxService.createEvent(manager, {
          event,
          aggregateType: 'PAYMENT',
          aggregateId: updatedPayment.id,
          merchantId,
          payload,
        });

        return updatedPayment;
      },
    );

    return {
      message: 'Payment processed',
      payment: {
        id: finalizedPayment.id,
        orderId: finalizedPayment.orderId,
        amount: finalizedPayment.amount,
        currency: finalizedPayment.currency,
        status: finalizedPayment.status,
        providerReference: finalizedPayment.providerReference,
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
