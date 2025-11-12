import { Injectable, signal } from '@angular/core';

const API_KEY_STORAGE_KEY = 'gemini-api-key';

@Injectable({
  providedIn: 'root'
})
export class ApiKeyService {
  apiKey = signal<string | null>(null);
  isModalOpen = signal(false);

  constructor() {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedKey) {
        this.apiKey.set(storedKey);
      }
    }
  }

  setApiKey(key: string): void {
    this.apiKey.set(key);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    }
    this.isModalOpen.set(false);
  }

  clearApiKey(): void {
    this.apiKey.set(null);
     if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  }

  openModal(): void {
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }
}
