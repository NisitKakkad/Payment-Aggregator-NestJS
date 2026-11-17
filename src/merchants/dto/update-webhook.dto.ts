import { IsUrl, IsNotEmpty } from 'class-validator';

export class UpdateWebhookDto {
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  @IsNotEmpty()
  webhookUrl: string;
}