import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import { Telegraf } from 'telegraf';
import { promisify } from 'util';
const youtubeDl = require('youtube-dl-exec');

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf;
  private ffprobe = promisify(ffmpeg.ffprobe);

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined');
    }
    this.bot = new Telegraf(token);
  }

  async onModuleInit() {
    this.bot.command('start', (ctx) => {
      ctx.reply(
        'Привет! 👋\n\nЯ могу скачивать и конвертировать видео.\n\n' +
          'Просто отправь мне:\n' +
          '- Ссылку на YouTube видео\n' +
          '- Ссылку на Instagram пост/reels\n' +
          '- Или просто видео файл\n\n' +
          'После отправки ссылки ты сможешь выбрать:\n' +
          '⭕️ Круглое видео - для видео-заметок\n' +
          '📹 Обычное видео - обычное скачивание',
      );
    });

    this.bot.on('text', async (ctx) => {
      try {
        const url = ctx.message.text;

        if (this.isYouTubeUrl(url) || this.isInstagramUrl(url)) {
          await ctx.reply('Выберите формат:', {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '⭕️ Круглое видео', callback_data: `round_${url}` },
                  { text: '📹 Обычное видео', callback_data: `normal_${url}` },
                ],
              ],
            },
          });
        } else {
          await ctx.reply(
            'Отправьте:\n' +
              '- Ссылку на YouTube видео\n' +
              '- Ссылку на Instagram пост/reels\n' +
              '- Или просто видео файл',
          );
        }
      } catch (error) {
        console.error('URL processing error:', error);
        await ctx.reply('Ошибка при обработке ссылки');
      }
    });

    this.bot.action(/^(round|normal)_(.+)$/, async (ctx) => {
      try {
        const [action, url] =
          ctx.match[1] === 'round'
            ? ['round', ctx.match[2]]
            : ['normal', ctx.match[2]];

        await ctx.editMessageText('Обработка видео...', {
          reply_markup: undefined,
        });

        if (this.isYouTubeUrl(url)) {
          if (action === 'round') {
            await this.processYouTubeVideo(ctx, url, true);
          } else {
            await this.processYouTubeVideo(ctx, url, false);
          }
        } else if (this.isInstagramUrl(url)) {
          if (action === 'round') {
            await this.processInstagramVideo(ctx, url, true);
          } else {
            await this.processInstagramVideo(ctx, url, false);
          }
        }
      } catch (error) {
        console.error('Callback processing error:', error);
        await ctx.reply('Ошибка при обработке видео');
      }
    });
    this.bot.on('video', async (ctx) => {
      try {
        const video = ctx.message.video;

        if (!video) {
          await ctx.reply('Ошибка: видео не найдено');
          return;
        }

        const fileSize = video.file_size || 0;
        if (fileSize > 52428800) {
          await ctx.reply('Видео слишком большое. Максимальный размер: 50MB');
          return;
        }

        const fileId = video.file_id;
        if (!fileId) {
          await ctx.reply('Ошибка: не удалось получить ID видео');
          return;
        }

        await ctx.reply('Выберите формат:', {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '⭕️ Круглое видео',
                  callback_data: `round_file_${fileId}`,
                },
                {
                  text: '📹 Обычное видео',
                  callback_data: `normal_file_${fileId}`,
                },
              ],
            ],
          },
        });
      } catch (error) {
        console.error('General error:', error);
        await ctx.reply('❌ Что-то пошло не так');
      }
    });

    this.bot.action(/^(round|normal)_file_(.+)$/, async (ctx) => {
      try {
        const [action, fileId] =
          ctx.match[1] === 'round'
            ? ['round', ctx.match[2]]
            : ['normal', ctx.match[2]];

        await ctx.editMessageText('Обработка видео...', {
          reply_markup: undefined,
        });
        await this.processVideoFile(ctx, fileId, action === 'round');
      } catch (error) {
        console.error('File processing error:', error);
        await ctx.reply('Ошибка при обработке файла');
      }
    });

    try {
      await this.bot.launch();
      console.log('Telegram bot started!');
    } catch (error) {
      console.error('Failed to start bot:', error);
    }
  }

  private async processVideoFile(ctx, fileId: string, isRound: boolean = true) {
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const inputPath = path.join(tempDir, `input-${fileId}.mp4`);
    await ctx.reply('⏳ Загрузка видео...');

    try {
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const response = await axios.get(fileLink.toString(), {
        responseType: 'arraybuffer',
      });
      fs.writeFileSync(inputPath, Buffer.from(response.data));

      if (isRound) {
        await this.processAndSendVideo(ctx, inputPath, fileId);
      } else {
        await ctx.replyWithVideo({ source: inputPath });
      }
    } catch (error) {
      console.error('Video processing error:', error);
      await ctx.reply('❌ Ошибка при обработке видео');
    } finally {
      this.cleanupFiles(inputPath);
    }
  }

  private async processAndSendVideo(
    ctx,
    inputPath: string,
    identifier: string,
  ) {
    try {
      const metadata = await this.ffprobe(inputPath);
      const duration = metadata.format.duration;
      const segments = Math.ceil(duration / 60);

      console.log(`Video duration: ${duration} seconds`);
      console.log(`Number of segments: ${segments}`);

      if (segments > 1) {
        await ctx.reply(
          `Видео длиннее 1 минуты (${Math.floor(duration)} сек). Будет разделено на ${segments} видео-кружков 🎬`,
        );
      }

      const tempDir = path.join(__dirname, '../../temp');

      for (let i = 0; i < segments; i++) {
        const startTime = i * 60;
        const outputPath = path.join(tempDir, `output-${identifier}-${i}.mp4`);

        await ctx.reply(`⏳ Обработка части ${i + 1} из ${segments}...`);

        await new Promise((resolve, reject) => {
          ffmpeg(inputPath)
            .setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path)
            .seekInput(startTime)
            .outputOptions([
              '-c:v',
              'libx264',
              '-c:a',
              'aac',
              '-preset',
              'medium',
              '-crf',
              '23',
              '-b:a',
              '128k',
              '-t',
              '60',
              '-vf',
              `crop=min(iw\\,ih):min(iw\\,ih),scale=384:384:force_original_aspect_ratio=increase,crop=384:384`,
              '-movflags',
              '+faststart',
            ])
            .toFormat('mp4')
            .on('progress', (progress) => {
              console.log(
                `Processing part ${i + 1}: ${progress.percent}% done`,
              );
            })
            .on('end', resolve)
            .on('error', reject)
            .save(outputPath);
        });

        try {
          const videoBuffer = fs.readFileSync(outputPath);
          await ctx.telegram.sendVideoNote(ctx.chat.id, {
            source: videoBuffer,
          });
          fs.unlinkSync(outputPath);
        } catch (error) {
          console.error('Send video note error:', error);
          await ctx.reply('❌ Не удалось отправить видео-кружок');
          break;
        }
      }

      await ctx.reply('✅ Готово!');
    } catch (error) {
      console.error('Processing error:', error);
      throw error;
    }
  }

  private async processYouTubeVideo(ctx, url: string, isRound: boolean = true) {
    try {
      await ctx.reply('⏳ Загрузка видео с YouTube...');

      const tempDir = path.join(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      try {
        const videoInfo = await youtubeDl(url, {
          dumpSingleJson: true,
          noWarnings: true,
        });

        if (!videoInfo || !videoInfo.id) {
          await ctx.reply('❌ Не удалось найти видео');
          return;
        }

        if (!videoInfo.duration || videoInfo.duration > 600) {
          await ctx.reply(
            'Видео слишком длинное. Максимальная длительность: 10 минут',
          );
          return;
        }

        const videoId = videoInfo.id;
        const inputPath = path.join(tempDir, `youtube-${videoId}.mp4`);

        await youtubeDl(url, {
          output: `${inputPath}`,
          format: 'mp4',
        });

        if (isRound) {
          await this.processAndSendVideo(ctx, inputPath, `yt-${videoId}`);
        } else {
          await ctx.replyWithVideo({ source: inputPath });
        }

        fs.unlinkSync(inputPath);
      } catch (error) {
        console.error('Error processing video:', error);
        await ctx.reply('❌ Ошибка при обработке видео');
        return;
      }
    } catch (error) {
      console.error('YouTube processing error:', error);
      await ctx.reply('❌ Ошибка при обработке YouTube видео');
    }
  }

  private async processInstagramVideo(
    ctx,
    url: string,
    isRound: boolean = true,
  ) {
    try {
      await ctx.reply('⏳ Загрузка видео из Instagram...');

      const tempDir = path.join(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      try {
        const videoId = this.extractInstagramId(url);
        const inputPath = path.join(tempDir, `instagram-${videoId}.mp4`);

        await youtubeDl(url, {
          output: `${inputPath}`,
          format: 'best',
          noWarnings: true,
          addHeader: [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          ],
        });

        if (!fs.existsSync(inputPath)) {
          throw new Error('Не удалось скачать видео');
        }

        if (isRound) {
          await this.processAndSendVideo(ctx, inputPath, `ig-${videoId}`);
        } else {
          await ctx.replyWithVideo({ source: inputPath });
        }

        fs.unlinkSync(inputPath);
      } catch (error) {
        console.error('Error downloading Instagram video:', error);
        await ctx.reply(
          '❌ Ошибка при скачивании видео. Убедитесь, что:\n' +
            '- Видео не приватное\n' +
            '- Аккаунт открытый\n' +
            '- В посте есть видео\n' +
            '- Ссылка корректная',
        );
        return;
      }
    } catch (error) {
      console.error('Instagram processing error:', error);
      await ctx.reply(error.message);
    }
  }

  private isYouTubeUrl(url: string): boolean {
    return url.includes('youtube.com') || url.includes('youtu.be');
  }

  private isInstagramUrl(url: string): boolean {
    try {
      const cleanUrl = url.toLowerCase();
      return (
        cleanUrl.includes('instagram.com') ||
        cleanUrl.includes('instagr.am') ||
        cleanUrl.includes('ig.me')
      );
    } catch {
      return false;
    }
  }

  private extractInstagramId(url: string): string {
    try {
      const cleanUrl = url.toLowerCase().split('?')[0];

      const patterns = [
        /instagram\.com\/reels?\/([A-Za-z0-9_-]+)/,
        /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
        /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
        /instagram\.com\/tv\/([A-Za-z0-9_-]+)/,
        /instagram\.com\/videos?\/([A-Za-z0-9_-]+)/,
        /instagr\.am\/p\/([A-Za-z0-9_-]+)/,
        /instagr\.am\/tv\/([A-Za-z0-9_-]+)/,
        /instagr\.am\/reels?\/([A-Za-z0-9_-]+)/,
        /instagram\.com\/stories\/[^\/]+\/([A-Za-z0-9_-]+)/,
      ];

      for (const pattern of patterns) {
        const matches = cleanUrl.match(pattern);
        if (matches && matches[1]) {
          return matches[1];
        }
      }

      const urlParts = cleanUrl.split('/').filter((part) => part.length > 0);
      const lastPart = urlParts[urlParts.length - 1];

      if (lastPart && lastPart.length > 5) {
        return lastPart;
      }

      console.log('Could not extract ID from URL:', url);
      throw new Error('Неподдерживаемый формат ссылки Instagram');
    } catch (error) {
      console.error('Error extracting Instagram ID:', error);
      throw new Error(
        'Неверный формат ссылки Instagram. Отправьте ссылку на пост, reel или видео.',
      );
    }
  }

  private cleanupFiles(...files: string[]) {
    for (const file of files) {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch (error) {
          console.error(`Failed to delete file ${file}:`, error);
        }
      }
    }
  }
}
