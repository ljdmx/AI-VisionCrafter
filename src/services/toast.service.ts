import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  toasts = signal<Toast[]>([]);
  private lastId = 0;

  show(message: string, type: 'success' | 'error', duration: number = 5000): void {
    const id = this.lastId++;
    this.toasts.update(currentToasts => [...currentToasts, { id, message, type }]);

    setTimeout(() => this.remove(id), duration);
  }

  showSuccess(message: string): void {
    this.show(message, 'success');
  }

  showError(message: string): void {
    this.show(message, 'error', 8000);
  }

  remove(id: number): void {
    this.toasts.update(currentToasts => currentToasts.filter(toast => toast.id !== id));
  }
}
