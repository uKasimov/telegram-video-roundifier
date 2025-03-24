import { Injectable } from '@nestjs/common';
import { Language } from './translations';

@Injectable()
export class LanguageService {
  private userLanguages: Map<number, Language> = new Map();
  private defaultLanguage: Language = 'ru';

  /**
   * Get user's preferred language
   * @param userId Telegram user ID
   * @returns User's language code or default language
   */
  getUserLanguage(userId: number): Language {
    return this.userLanguages.get(userId) || this.defaultLanguage;
  }

  /**
   * Set user's preferred language
   * @param userId Telegram user ID
   * @param language Language code
   */
  setUserLanguage(userId: number, language: Language): void {
    this.userLanguages.set(userId, language);
  }

  /**
   * Check if the provided string is a valid language code
   * @param lang Language code to check
   * @returns Boolean indicating if it's a valid language
   */
  isValidLanguage(lang: string): lang is Language {
    return ['uz', 'ru', 'en'].includes(lang);
  }
}
