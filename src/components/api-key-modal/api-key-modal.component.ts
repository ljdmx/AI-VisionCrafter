import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApiKeyService } from '../../services/api-key.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-api-key-modal',
  templateUrl: './api-key-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiKeyModalComponent {
  apiKeyService = inject(ApiKeyService);
  toastService = inject(ToastService);
  
  newApiKey = signal('');

  updateKey(event: Event): void {
    this.newApiKey.set((event.target as HTMLInputElement).value);
  }

  saveKey(): void {
    const key = this.newApiKey().trim();
    if (key) {
      this.apiKeyService.setApiKey(key);
      this.toastService.showSuccess('API 密钥已保存。');
    } else {
      this.toastService.showError('请输入有效的 API 密钥。');
    }
  }
}
