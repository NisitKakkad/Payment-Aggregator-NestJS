import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WebhooksService } from './webhooks.service.js';

@Processor('webhook-delivery')
export class WebhookProcessor extends WorkerHost {
  constructor(private readonly webhooksService: WebhooksService) {
    super();
  }

  async process(job: Job<{ webhookId: string }>) {
    console.log(`Processing webhook: ${job.data.webhookId}`);

    return this.webhooksService.deliverWebhook(job.data.webhookId);
  }
}
