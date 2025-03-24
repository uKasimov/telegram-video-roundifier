import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ConfigModule } from '@nestjs/config';
import { I18nModule } from '../i18n/i18n.module';

@Module({
  imports: [ConfigModule, I18nModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
