// Translations for the Telegram bot
// Supports Uzbek (uz), Russian (ru), and English (en)

export type Language = 'uz' | 'ru' | 'en';

interface Translations {
  [key: string]: {
    uz: string;
    ru: string;
    en: string;
  };
}

export const translations: Translations = {
  welcome: {
    uz: 'Salom! 👋\n\nMen video yuklab olish va konvertatsiya qilishim mumkin.\n\nShunchaki menga yuboring:\n- YouTube video havolasi\n- Instagram post/reels havolasi\n- Yoki shunchaki video fayl\n\nHavolani yuborgandan so\'ng, siz tanlashingiz mumkin:\n⭕️ Doira video - video eslatmalar uchun\n📹 Oddiy video - oddiy yuklab olish',
    ru: 'Привет! 👋\n\nЯ могу скачивать и конвертировать видео.\n\nПросто отправь мне:\n- Ссылку на YouTube видео\n- Ссылку на Instagram пост/reels\n- Или просто видео файл\n\nПосле отправки ссылки ты сможешь выбрать:\n⭕️ Круглое видео - для видео-заметок\n📹 Обычное видео - обычное скачивание',
    en: 'Hello! 👋\n\nI can download and convert videos.\n\nJust send me:\n- YouTube video link\n- Instagram post/reels link\n- Or just a video file\n\nAfter sending the link, you can choose:\n⭕️ Round video - for video notes\n📹 Regular video - regular download',
  },
  invalidUrl: {
    uz: 'Yuborish:\n- YouTube video havolasi\n- Instagram post/reels havolasi\n- Yoki shunchaki video fayl',
    ru: 'Отправьте:\n- Ссылку на YouTube видео\n- Ссылку на Instagram пост/reels\n- Или просто видео файл',
    en: 'Send:\n- YouTube video link\n- Instagram post/reels link\n- Or just a video file',
  },
  processingVideo: {
    uz: 'Video qayta ishlanmoqda...',
    ru: 'Обработка видео...',
    en: 'Processing video...',
  },
  downloadingFromYouTube: {
    uz: '⏳ YouTube dan video yuklab olinmoqda...',
    ru: '⏳ Загрузка видео с YouTube...',
    en: '⏳ Downloading video from YouTube...',
  },
  downloadingFromInstagram: {
    uz: '⏳ Instagram dan video yuklab olinmoqda...',
    ru: '⏳ Загрузка видео из Instagram...',
    en: '⏳ Downloading video from Instagram...',
  },
  downloadingVideo: {
    uz: '⏳ Video yuklab olinmoqda...',
    ru: '⏳ Загрузка видео...',
    en: '⏳ Downloading video...',
  },
  videoNotFound: {
    uz: '❌ Video topilmadi',
    ru: '❌ Не удалось найти видео',
    en: '❌ Video not found',
  },
  videoTooLong: {
    uz: 'Video juda uzun. Maksimal davomiyligi: 10 daqiqa',
    ru: 'Видео слишком длинное. Максимальная длительность: 10 минут',
    en: 'Video is too long. Maximum duration: 10 minutes',
  },
  videoTooLarge: {
    uz: 'Video juda katta. Maksimal hajmi: 50MB',
    ru: 'Видео слишком большое. Максимальный размер: 50MB',
    en: 'Video is too large. Maximum size: 50MB',
  },
  errorProcessingVideo: {
    uz: '❌ Video qayta ishlashda xatolik',
    ru: '❌ Ошибка при обработке видео',
    en: '❌ Error processing video',
  },
  errorProcessingYouTube: {
    uz: '❌ YouTube videoni qayta ishlashda xatolik',
    ru: '❌ Ошибка при обработке YouTube видео',
    en: '❌ Error processing YouTube video',
  },
  errorProcessingInstagram: {
    uz: '❌ Instagram videoni qayta ishlashda xatolik',
    ru: '❌ Ошибка при обработке Instagram видео',
    en: '❌ Error processing Instagram video',
  },
  errorProcessingFile: {
    uz: '❌ Faylni qayta ishlashda xatolik',
    ru: '❌ Ошибка при обработке файла',
    en: '❌ Error processing file',
  },
  errorGeneral: {
    uz: '❌ Nimadir xato ketdi',
    ru: '❌ Что-то пошло не так',
    en: '❌ Something went wrong',
  },
  videoIdNotFound: {
    uz: '❌ Video ID topilmadi',
    ru: '❌ ID видео не найдено',
    en: '❌ Video ID not found',
  },
  choosingFormat: {
    uz: 'Formatni tanlang:',
    ru: 'Выберите формат:',
    en: 'Choose format:',
  },
  roundVideo: {
    uz: '⭕️ Doira video',
    ru: '⭕️ Круглое видео',
    en: '⭕️ Round video',
  },
  regularVideo: {
    uz: '📹 Oddiy video',
    ru: '📹 Обычное видео',
    en: '📹 Regular video',
  },
  processingPart: {
    uz: '⏳ Qism qayta ishlanmoqda %s dan %s...',
    ru: '⏳ Обработка части %s из %s...',
    en: '⏳ Processing part %s of %s...',
  },
  videoLongerThanMinute: {
    uz: 'Video 1 daqiqadan uzun (%s sek). %s ta video-doiraga bo\'linadi 🎬',
    ru: 'Видео длиннее 1 минуты (%s сек). Будет разделено на %s видео-кружков 🎬',
    en: 'Video is longer than 1 minute (%s sec). It will be split into %s video circles 🎬',
  },
  languageChanged: {
    uz: '✅ Til o\'zbekchaga o\'zgartirildi',
    ru: '✅ Язык изменен на русский',
    en: '✅ Language changed to English',
  },
  chooseLanguage: {
    uz: 'Tilni tanlang:',
    ru: 'Выберите язык:',
    en: 'Choose language:',
  },
};

// Helper function to get translation
export function t(key: string, lang: Language, ...args: any[]): string {
  const translation = translations[key]?.[lang] || translations[key]?.en || key;
  
  if (args.length > 0) {
    return args.reduce((str, arg, i) => str.replace(`%s`, arg), translation);
  }
  
  return translation;
}
