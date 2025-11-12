import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GeminiService } from '../../services/gemini.service';
import { ToastService } from '../../services/toast.service';

interface StylePreset {
  name: string;
  imageUrl: string;
  promptFragment: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

@Component({
  selector: 'app-text-to-image',
  templateUrl: './text-to-image.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'flex-grow min-h-0'
  }
})
export class TextToImageComponent {
  geminiService = inject(GeminiService);
  toastService = inject(ToastService);

  prompt = signal<string>('一只穿着宇航服的柯基犬，在月球上');
  negativePrompt = signal<string>('');
  aspectRatio = signal<string>('1:1');
  selectedStyle = signal<StylePreset | null>(null);
  seed = signal<number | null>(null);

  referenceImageFile = signal<File | null>(null);
  referenceImageUrl = signal<string | null>(null);
  isDraggingReference = signal(false);

  generatedImageUrl = signal<string | null>(null);
  isLoading = signal<boolean>(false);
  isOptimizingPrompt = signal<boolean>(false);

  styles: StylePreset[] = [
    { name: '赛博朋克', imageUrl: 'https://picsum.photos/seed/cyberpunk/200/200', promptFragment: 'cyberpunk, neon lighting, futuristic cityscape, Blade Runner style, highly detailed' },
    { name: '吉卜力动画', imageUrl: 'https://picsum.photos/seed/ghibli/200/200', promptFragment: 'Studio Ghibli anime style, hand-drawn, whimsical, vibrant colors, detailed background' },
    { name: '水墨画', imageUrl: 'https://picsum.photos/seed/inkwash/200/200', promptFragment: 'Chinese ink wash painting (Shuimohua), minimalist, black and white, traditional, calligraphy strokes' },
    { name: '电影感人像', imageUrl: 'https://picsum.photos/seed/portrait/200/200', promptFragment: 'cinematic portrait photography, dramatic lighting, shallow depth of field, 35mm lens, film grain' },
    { name: '超现实主义', imageUrl: 'https://picsum.photos/seed/surreal/200/200', promptFragment: 'surrealism, dreamlike, bizarre, Salvador Dali style, illogical scene' },
    { name: '像素艺术', imageUrl: 'https://picsum.photos/seed/pixel/200/200', promptFragment: 'pixel art, 16-bit, retro gaming style, vibrant palette' },
    { name: '幻想', imageUrl: 'https://picsum.photos/seed/fantasy/200/200', promptFragment: 'fantasy art, epic, detailed, mythical creatures, magical landscape, by Frank Frazetta' },
    { name: '蒸汽朋克', imageUrl: 'https://picsum.photos/seed/steampunk/200/200', promptFragment: 'steampunk, Victorian era, gears and cogs, steam-powered machinery, intricate details, brass and copper' },
    { name: '水彩', imageUrl: 'https://picsum.photos/seed/watercolor/200/200', promptFragment: 'watercolor painting, soft edges, translucent colors, wet-on-wet technique, delicate' },
    { name: '低多边形', imageUrl: 'https://picsum.photos/seed/lowpoly/200/200', promptFragment: 'low poly, geometric, faceted, minimalist, modern, vibrant colors' },
    { name: '漫画书', imageUrl: 'https://picsum.photos/seed/comic/200/200', promptFragment: 'comic book style, bold outlines, halftone dots, vibrant colors, dynamic action, pop art' },
    { name: '3D模型', imageUrl: 'https://picsum.photos/seed/3dmodel/200/200', promptFragment: '3D model, rendered in Octane, trending on ArtStation, polished, detailed, realistic materials' },
  ];

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
    // Generate a large random integer for the seed
    this.seed.set(Math.floor(Math.random() * 2**32));
  }

  selectStyle(style: StylePreset): void {
    if (this.selectedStyle()?.name === style.name) {
      this.selectedStyle.set(null); // Toggle off if already selected
    } else {
      this.selectedStyle.set(style);
    }
  }
  
  handleReferenceFile(file: File): void {
    if (file.size > MAX_FILE_SIZE) {
        this.toastService.showError('参考图文件过大，请上传小于5MB的图片。');
        return;
    }
    if (file && (file.type === 'image/png' || file.type === 'image/jpeg')) {
        this.referenceImageFile.set(file);
        const reader = new FileReader();
        reader.onload = (e: any) => {
            this.referenceImageUrl.set(e.target.result);
        };
        reader.readAsDataURL(file);
    } else {
        this.toastService.showError('请上传 PNG 或 JPG 格式的参考图。');
    }
  }

  onReferenceFileSelected(event: Event): void {
    const element = event.currentTarget as HTMLInputElement;
    const fileList: FileList | null = element.files;
    if (fileList && fileList[0]) {
      this.handleReferenceFile(fileList[0]);
    }
  }
  
  onReferenceFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingReference.set(false);
    if (event.dataTransfer?.files[0]) {
      this.handleReferenceFile(event.dataTransfer.files[0]);
    }
  }
  
  clearReferenceImage(): void {
    this.referenceImageFile.set(null);
    this.referenceImageUrl.set(null);
  }

  async optimizePrompt(): Promise<void> {
    const currentPrompt = this.prompt();
    if (!currentPrompt || this.isOptimizingPrompt() || this.isLoading()) {
      return;
    }
    
    this.isOptimizingPrompt.set(true);
    const optimizedPrompt = await this.geminiService.optimizePrompt(currentPrompt);
    
    if (optimizedPrompt) {
      this.prompt.set(optimizedPrompt);
    }
    
    this.isOptimizingPrompt.set(false);
  }

  async generateImage(): Promise<void> {
    const currentPrompt = this.prompt();
    if (!currentPrompt || this.isLoading()) {
      if(!currentPrompt) this.toastService.showError("请输入您的画面描述。");
      return;
    }

    this.isLoading.set(true);
    this.generatedImageUrl.set(null);

    const result = await this.geminiService.generateImageFromText(
      currentPrompt,
      this.negativePrompt(),
      this.aspectRatio(),
      this.selectedStyle()?.promptFragment,
      this.referenceImageFile(),
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
        a.download = 'ai-generated-image.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
  }
}