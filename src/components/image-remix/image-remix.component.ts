import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GeminiService } from '../../services/gemini.service';
import { ToastService } from '../../services/toast.service';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

@Component({
  selector: 'app-image-remix',
  templateUrl: './image-remix.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'flex-grow min-h-0'
  }
})
export class ImageRemixComponent {
  geminiService = inject(GeminiService);
  toastService = inject(ToastService);

  prompt = signal<string>('');
  negativePrompt = signal<string>('');
  aspectRatio = signal<string>('1:1');
  seed = signal<number | null>(null);

  contentFile = signal<File | null>(null);
  contentImageUrl = signal<string | null>(null);
  styleFile = signal<File | null>(null);
  styleImageUrl = signal<string | null>(null);

  isDraggingContent = signal(false);
  isDraggingStyle = signal(false);

  generatedImageUrl = signal<string | null>(null);
  isLoading = signal<boolean>(false);

  handleFile(file: File, type: 'content' | 'style'): void {
    if (file.size > MAX_FILE_SIZE) {
        this.toastService.showError('文件过大，请上传小于5MB的图片。');
        return;
    }
    if (file && (file.type === 'image/png' || file.type === 'image/jpeg')) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        if (type === 'content') {
          this.contentFile.set(file);
          this.contentImageUrl.set(e.target.result);
        } else {
          this.styleFile.set(file);
          this.styleImageUrl.set(e.target.result);
        }
      };
      reader.readAsDataURL(file);
    } else {
      this.toastService.showError('请上传 PNG 或 JPG 格式的图片。');
    }
  }

  onFileSelected(event: Event, type: 'content' | 'style'): void {
    const element = event.currentTarget as HTMLInputElement;
    const fileList: FileList | null = element.files;
    if (fileList && fileList[0]) {
      this.handleFile(fileList[0], type);
    }
  }

  onFileDrop(event: DragEvent, type: 'content' | 'style'): void {
    event.preventDefault();
    if (type === 'content') this.isDraggingContent.set(false);
    else this.isDraggingStyle.set(false);
    
    if (event.dataTransfer?.files[0]) {
      this.handleFile(event.dataTransfer.files[0], type);
    }
  }
  
  clearContentImage(): void {
    this.contentFile.set(null);
    this.contentImageUrl.set(null);
  }

  clearStyleImage(): void {
    this.styleFile.set(null);
    this.styleImageUrl.set(null);
  }

  updatePrompt(event: Event, type: 'positive' | 'negative' = 'positive'): void {
    const input = event.target as HTMLTextAreaElement;
    if (type === 'positive') {
      this.prompt.set(input.value);
    } else {
      this.negativePrompt.set(input.value);
    }
  }
  
  updateSeed(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const numberValue = parseInt(value, 10);
    this.seed.set(isNaN(numberValue) ? null : numberValue);
  }

  randomizeSeed(): void {
    this.seed.set(Math.floor(Math.random() * 2**32));
  }

  async generateImage(): Promise<void> {
    const content = this.contentFile();
    const style = this.styleFile();

    if (!content || !style) {
      this.toastService.showError("请同时提供内容图和风格图。");
      return;
    }

    this.isLoading.set(true);
    this.generatedImageUrl.set(null);

    const result = await this.geminiService.remixImage(
      content,
      style,
      this.prompt(),
      this.negativePrompt(),
      this.aspectRatio(),
      this.seed()
    );

    if (result) {
      this.generatedImageUrl.set(result);
    }

    this.isLoading.set(false);
  }

  downloadImage(): void {
    const url = this.generatedImageUrl();
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ai-remixed-image.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }
}