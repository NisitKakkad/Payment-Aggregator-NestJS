
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Order, OrderStatus } from './entities/order.entity.js';
import { CreateOrderDto } from './dto/create-order.dto.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async create(merchantId: string, dto: CreateOrderDto) {
    const order = this.orderRepository.create({
      merchantId,
      amount: dto.amount.toString(),
      currency: dto.currency,
      receipt: dto.receipt,
    });

    try {
      const savedOrder = await this.orderRepository.save(order);

      return {
        message: 'Order created successfully',
        order: {
          id: savedOrder.id,
          merchantId: savedOrder.merchantId,
          amount: savedOrder.amount,
          currency: savedOrder.currency,
          receipt: savedOrder.receipt,
          status: savedOrder.status,
          createdAt: savedOrder.createdAt,
        },
      };
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException(
          'Receipt already exists for this merchant',
        );
      }

      throw error;
    }
  }
  async findOne(merchantId: string, orderId: string) {
  const order = await this.orderRepository.findOne({
    where: {
      id: orderId,
      merchantId,
    },
  });

  if (!order) {
    throw new NotFoundException('Order not found');
  }

  return order;
}
async findAll(merchantId: string, page: number, limit: number) {
  const [orders, total] = await this.orderRepository.findAndCount({
    where: { merchantId },
    order: { createdAt: 'DESC' },
    skip: (page - 1) * limit,
    take: limit,
  });

  return {
    data: orders,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async cancel(merchantId: string, orderId: string) {
  const order = await this.orderRepository.findOne({
    where: {
      id: orderId,
      merchantId,
    },
  });

  if (!order) {
    throw new NotFoundException('Order not found');
  }

  if (order.status !== OrderStatus.CREATED) {
    throw new ConflictException(
      'Only newly created orders can be cancelled',
    );
  }

  order.status = OrderStatus.CANCELLED;

  await this.orderRepository.save(order);

  return {
    message: 'Order cancelled successfully',
    order: {
      id: order.id,
      status: order.status,
    },
  };
}
}
