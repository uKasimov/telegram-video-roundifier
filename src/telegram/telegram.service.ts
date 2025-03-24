import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import { Telegraf, Context, Middleware } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import { promisify } from 'util';
const youtubeDl = require('youtube-dl-exec');
import { LanguageService } from '../i18n/language.service';
import { Language, t } from '../i18n/translations';

// Interface for YouTube video info returned by youtube-dl-exec
interface YoutubeVideoInfo {
  id: string;
  duration: number;
  title?: string;
  [key: string]: any; // Allow other properties
}

@Injectable()
export class TelegramService implements OnModuleInit {
  // Maps to temporarily store URLs and file IDs with their reference IDs
  private tempUrls: Map<string, string> = new Map();
  private tempFileIds: Map<string, string> = new Map();
  private bot: Telegraf;
  private ffprobe = promisify(ffmpeg.ffprobe);
  private readonly tempDirPath: string;
  
  // Helper method to get the temp directory path
  private getTempDir(): string {
    return this.tempDirPath;
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly languageService: LanguageService
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined');
    }
    this.bot = new Telegraf(token);
    
    // Initialize the temp directory path
    this.tempDirPath = './temp';
    if (!fs.existsSync(this.tempDirPath)) {
      fs.mkdirSync(this.tempDirPath, { recursive: true });
    }
  }

  async onModuleInit() {
    // Add language command
    this.bot.command('language', (ctx) => this.handleLanguageCommand(ctx));
    this.bot.command('lang', (ctx) => this.handleLanguageCommand(ctx));
    
    // Add language shortcuts
    this.bot.command('en', (ctx) => this.setLanguage(ctx, 'en'));
    this.bot.command('ru', (ctx) => this.setLanguage(ctx, 'ru'));
    this.bot.command('uz', (ctx) => this.setLanguage(ctx, 'uz'));
    
    // Register language selection callback
    this.bot.action(/^(uz|ru|en)$/, (ctx) => this.handleLanguageCallback(ctx as any));
    
    this.bot.command('start', (ctx) => {
      const userId = ctx.from?.id;
      const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
      ctx.reply(t('welcome', lang), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇺🇿 UZ', callback_data: 'uz' },
              { text: '🇷🇺 RU', callback_data: 'ru' },
              { text: '🇬🇧 EN', callback_data: 'en' },
            ],
          ],
        },
      });
    });

    this.bot.on('text', async (ctx) => {
      try {
        const url = ctx.message.text;
        const userId = ctx.from?.id;
        const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';

        if (this.isYouTubeUrl(url) || this.isInstagramUrl(url)) {
          // For video URLs, we'll use a shorter callback data format
          // Store the URL temporarily and use a reference ID
          const urlId = Date.now().toString();
          this.tempUrls = this.tempUrls || new Map();
          this.tempUrls.set(urlId, url);
          
          await ctx.reply(t('choosingFormat', lang), {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: t('roundVideo', lang), callback_data: `r_${urlId}` },
                  { text: t('regularVideo', lang), callback_data: `n_${urlId}` },
                ],
              ],
            },
          });
        } else {
          await ctx.reply(t('invalidUrl', lang));
        }
      } catch (error) {
        console.error('URL processing error:', error);
        const userId = ctx.from?.id;
        const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
        await ctx.reply(t('errorGeneral', lang));
      }
    });

    this.bot.action(/^(r|n)_(.+)$/, async (ctx) => {
      try {
        const userId = ctx.from?.id;
        const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
        
        const urlId = ctx.match[2];
        const url = this.tempUrls.get(urlId);
        
        if (!url) {
          await ctx.reply(t('errorGeneral', lang));
          return;
        }
        
        const isRound = ctx.match[1] === 'r';

        await ctx.editMessageText(t('processingVideo', lang), {
          reply_markup: undefined,
        });

        if (this.isYouTubeUrl(url)) {
          await this.processYouTubeVideo(ctx, url, isRound);
          // Clean up the temporary URL
          this.tempUrls.delete(urlId);
        } else if (this.isInstagramUrl(url)) {
          await this.processInstagramVideo(ctx, url, isRound);
          // Clean up the temporary URL
          this.tempUrls.delete(urlId);
        }
      } catch (error) {
        console.error('Callback processing error:', error);
        await ctx.reply('Ошибка при обработке видео');
      }
    });
    this.bot.on('video', async (ctx) => {
      try {
        const video = ctx.message.video;
        const userId = ctx.from?.id;
        const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';

        if (!video) {
          await ctx.reply(t('videoNotFound', lang));
          return;
        }

        const fileSize = video.file_size || 0;
        if (fileSize > 52428800) {
          await ctx.reply(t('videoTooLarge', lang));
          return;
        }

        const fileId = video.file_id;
        if (!fileId) {
          await ctx.reply(t('videoIdNotFound', lang));
          return;
        }

        // For file IDs, we'll use a reference ID in callback data
        const fileRefId = Date.now().toString();
        this.tempFileIds = this.tempFileIds || new Map();
        this.tempFileIds.set(fileRefId, fileId);
        
        await ctx.reply(t('choosingFormat', lang), {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t('roundVideo', lang),
                  callback_data: `rf_${fileRefId}`,
                },
                {
                  text: t('regularVideo', lang),
                  callback_data: `nf_${fileRefId}`,
                },
              ],
            ],
          },
        });
      } catch (error) {
        console.error('General error:', error);
        const userId = ctx.from?.id;
        const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
        await ctx.reply(t('errorGeneral', lang));
      }
    });

    this.bot.action(/^(rf|nf)_(.+)$/, async (ctx) => {
      try {
        const userId = ctx.from?.id;
        const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
        
        // Get the file reference ID
        const fileRefId = ctx.match[2];
        
        // Get the actual file ID from our temporary storage
        const fileId = this.tempFileIds.get(fileRefId);
        
        // Check if we have a valid file ID
        if (!fileId) {
          await ctx.reply(t('errorGeneral', lang));
          return;
        }
        
        const isRound = ctx.match[1] === 'rf';

        await ctx.editMessageText(t('processingVideo', lang), {
          reply_markup: undefined,
        });
        await this.processVideoFile(ctx, fileId, isRound);
        
        // Clean up the temporary file ID
        this.tempFileIds.delete(fileRefId);
      } catch (error) {
        console.error('File processing error:', error);
        const userId = ctx.from?.id;
        const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
        await ctx.reply(t('errorProcessingFile', lang));
      }
    });

    try {
      await this.bot.launch();
      console.log('Telegram bot started!');
    } catch (error) {
      console.error('Failed to start bot:', error);
    }
  }

  /**
   * Handle the /language or /lang command
   */
  private async handleLanguageCommand(ctx: Context) {
    const userId = ctx.from?.id;
    const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
    
    await ctx.reply(t('chooseLanguage', lang), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇺🇿 UZ', callback_data: 'uz' },
            { text: '🇷🇺 RU', callback_data: 'ru' },
            { text: '🇬🇧 EN', callback_data: 'en' },
          ],
        ],
      },
    });
  }

  /**
   * Set user language from command
   */
  private async setLanguage(ctx: Context, langCode: Language) {
    const userId = ctx.from?.id;
    if (userId) {
      this.languageService.setUserLanguage(userId, langCode);
      await ctx.reply(t('languageChanged', langCode));
    }
  }

  /**
   * Handle language selection callback
   */
  private async handleLanguageCallback(ctx: Context & { match: RegExpExecArray }) {
    const userId = ctx.from?.id;
    if (!userId) return;
    
    // Get language code from the regex match
    const match = ctx.match;
    if (!match || !match[1]) return;
    
    const langCode = match[1] as Language;
    
    // Set the user's language preference
    this.languageService.setUserLanguage(userId, langCode);
    
    // Update the message
    await ctx.editMessageText(t('languageChanged', langCode));
  }

  private async processVideoFile(ctx, fileId: string, isRound: boolean = true) {
    const tempDir = this.getTempDir();
    const userId = ctx.from?.id;
    const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';

    const inputPath = path.join(tempDir, `input-${fileId}.mp4`);
    await ctx.reply(t('downloadingVideo', lang));

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
        const userId = ctx.from?.id;
        const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
        await ctx.reply(t('videoLongerThanMinute', lang, Math.floor(duration), segments));
      }

      const tempDir = this.getTempDir();

      for (let i = 0; i < segments; i++) {
        const startTime = i * 60;
        const outputPath = path.join(tempDir, `output-${identifier}-${i}.mp4`);

        const userId = ctx.from?.id;
        const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
        await ctx.reply(t('processingPart', lang, i + 1, segments));

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
              // Ensure progress percentage is a number and format it properly
              const percent = progress.percent ? Math.round(progress.percent * 100) / 100 : 0;
              console.log(
                `Processing part ${i + 1}: ${percent}% done`,
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
      const userId = ctx.from?.id;
      const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
      await ctx.reply(t('downloadingFromYouTube', lang));

      const tempDir = this.getTempDir();

      try {
        const subprocess = youtubeDl.exec(url, {
          dumpSingleJson: true,
          noWarnings: true,
        });
        
        // Collect the output
        let output = '';
        subprocess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        await new Promise((resolve, reject) => {
          subprocess.on('close', (code) => {
            if (code === 0) resolve(null);
            else reject(new Error(`Process exited with code ${code}`));
          });
        });
        
        const videoInfo = JSON.parse(output) as YoutubeVideoInfo;

        if (!videoInfo || !videoInfo.id) {
          const userId = ctx.from?.id;
          const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
          await ctx.reply(t('videoNotFound', lang));
          return;
        }

        if (!videoInfo.duration || videoInfo.duration > 600) {
          const userId = ctx.from?.id;
          const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
          await ctx.reply(t('videoTooLong', lang));
          return;
        }

        const videoId = videoInfo.id;
        const inputPath = path.join(tempDir, `youtube-${videoId}.mp4`);

        const downloadProcess = youtubeDl.exec(url, {
          output: `${inputPath}`,
          format: 'mp4',
        });
        
        await new Promise((resolve, reject) => {
          downloadProcess.on('close', (code) => {
            if (code === 0) resolve(null);
            else reject(new Error(`Download process exited with code ${code}`));
          });
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
      const userId = ctx.from?.id;
      const lang = userId ? this.languageService.getUserLanguage(userId) : 'ru';
      await ctx.reply(t('downloadingFromInstagram', lang));

      const tempDir = this.getTempDir();

      try {
        const videoId = this.extractInstagramId(url);
        const inputPath = path.join(tempDir, `instagram-${videoId}.mp4`);

        const downloadProcess = youtubeDl.exec(url, {
          output: `${inputPath}`,
          format: 'best',
          noWarnings: true,
          addHeader: [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          ],
        });
        
        await new Promise((resolve, reject) => {
          downloadProcess.on('close', (code) => {
            if (code === 0) resolve(null);
            else reject(new Error(`Download process exited with code ${code}`));
          });
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
