import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { GeminiService } from '../../services/gemini.service';
import { ToastService } from '../../services/toast.service';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

@Component({
  selector: 'app-image-editor',
  templateUrl: './image-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'flex-grow min-h-0'
  }
})
export class ImageEditorComponent {
  geminiService = inject(GeminiService);
  toastService = inject(ToastService);
  
  prompt = signal<string>('');
  negativePrompt = signal<string>('');
  seed = signal<number | null>(null);
  
  referenceImageFile = signal<File | null>(null);
  referenceImageUrl = signal<string | null>(null);
  isDraggingReference = signal(false);
  
  currentImageUrl = signal<string | null>(null);

  isLoading = signal<boolean>(false);
  isOptimizingPrompt = signal<boolean>(false);
  isDraggingOver = signal<boolean>(false);
  
  // Local Edit (Masking) State
  isLocalEditMode = signal(false);
  brushSize = signal(30);
  isDrawing = signal(false);
  
  maskCanvas = viewChild<ElementRef<HTMLCanvasElement>>('maskCanvas');
  private maskCtx: CanvasRenderingContext2D | null = null;
  private lastPos: { x: number, y: number } | null = null;

  constructor() {
    effect(() => {
      const canvasEl = this.maskCanvas()?.nativeElement;
      const imageUrl = this.currentImageUrl();
      if (canvasEl && imageUrl) {
        this.setupCanvas(imageUrl);
      }
    });
  }

  private setupCanvas(imageUrl: string): void {
    const canvas = this.maskCanvas()?.nativeElement;
    if (!canvas) return;
    this.maskCtx = canvas.getContext('2d');
    const image = new Image();
    image.crossOrigin = "anonymous"; // Handle tainted canvas
    image.src = imageUrl;
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
    };
  }

  clearCanvas(): void {
    const canvas = this.maskCanvas()?.nativeElement;
    if (canvas && this.maskCtx) {
      this.maskCtx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  private async dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
  }

  handleFile(file: File): void {
    if (file.size > MAX_FILE_SIZE) {
        this.toastService.showError('文件过大，请上传小于5MB的图片。');
        return;
    }
    if (file && (file.type === 'image/png' || file.type === 'image/jpeg')) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
           this.currentImageUrl.set(e.target.result);
        };
        reader.readAsDataURL(file);
    } else {
        this.toastService.showError('请上传 PNG 或 JPG 格式的图片。');
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

  onFileSelected(event: Event): void {
    const element = event.currentTarget as HTMLInputElement;
    const fileList: FileList | null = element.files;
    if (fileList && fileList[0]) {
      this.handleFile(fileList[0]);
    }
  }

  onReferenceFileSelected(event: Event): void {
    const element = event.currentTarget as HTMLInputElement;
    const fileList: FileList | null = element.files;
    if (fileList && fileList[0]) {
      this.handleReferenceFile(fileList[0]);
    }
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingOver.set(false);
    if (event.dataTransfer?.files[0]) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  onReferenceFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingReference.set(false);
    if (event.dataTransfer?.files[0]) {
      this.handleReferenceFile(event.dataTransfer.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    this.isDraggingOver.set(false);
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

  updateBrushSize(event: Event): void {
    this.brushSize.set((event.target as HTMLInputElement).valueAsNumber);
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
    const lastImageUrl = this.currentImageUrl();

    if (!lastImageUrl || !currentPrompt || this.isLoading()) {
      if (!currentPrompt) this.toastService.showError("请输入您的修改指令。");
      return;
    }

    this.isLoading.set(true);

    let maskBase64: string | null = null;
    if (this.isLocalEditMode()) {
      maskBase64 = this.getMaskAsBase64();
      if (maskBase64) this.clearCanvas(); // Clear mask after use
    }
    
    const imageFile = await this.dataUrlToFile(lastImageUrl, 'last-image.png');
    
    const result = await this.geminiService.generateEditedImage(
      imageFile, 
      currentPrompt, 
      maskBase64, 
      this.referenceImageFile(),
      this.negativePrompt(),
      this.seed()
    );
    
    if (result) {
       this.currentImageUrl.set(result.imageUrl);
       this.prompt.set('');
    }
    
    this.isLoading.set(false);
  }

  clearReferenceImage(): void {
    this.referenceImageFile.set(null);
    this.referenceImageUrl.set(null);
  }
  
  changeImage(): void {
    this.currentImageUrl.set(null);
    this.isLocalEditMode.set(false);
  }

  startNewSession(): void {
    this.currentImageUrl.set(null);
    this.prompt.set('');
    this.negativePrompt.set('');
    this.isLocalEditMode.set(false);
    this.clearReferenceImage();
    this.seed.set(null);
  }

  downloadImage(): void {
    const url = this.currentImageUrl();
    if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ai-edited-image.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
  }

  // Masking logic
  private getCanvasPosition(event: MouseEvent | TouchEvent): { x: number, y: number } | null {
    const canvas = this.maskCanvas()?.nativeElement;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  startDrawing(event: MouseEvent | TouchEvent): void {
    if (!this.isLocalEditMode() || !this.maskCtx) return;
    event.preventDefault();
    this.isDrawing.set(true);
    this.lastPos = this.getCanvasPosition(event);
  }

  stopDrawing(): void {
    this.isDrawing.set(false);
    this.lastPos = null;
  }

  draw(event: MouseEvent | TouchEvent): void {
    if (!this.isDrawing() || !this.maskCtx || !this.lastPos) return;
    event.preventDefault();
    const pos = this.getCanvasPosition(event);
    if (!pos) return;

    this.maskCtx.beginPath();
    this.maskCtx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    this.maskCtx.lineWidth = this.brushSize();
    this.maskCtx.lineCap = 'round';
    this.maskCtx.lineJoin = 'round';
    this.maskCtx.moveTo(this.lastPos.x, this.lastPos.y);
    this.maskCtx.lineTo(pos.x, pos.y);
    this.maskCtx.stroke();
    
    this.lastPos = pos;
  }

  private getMaskAsBase64(): string | null {
    const canvas = this.maskCanvas()?.nativeElement;
    if (!canvas || !this.maskCtx) return null;

    const pixelBuffer = new Uint32Array(
      this.maskCtx.getImageData(0, 0, canvas.width, canvas.height).data.buffer
    );
    if (!pixelBuffer.some(color => color !== 0)) {
        return null;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    
    tempCtx.drawImage(canvas, 0, 0);
    
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    for(let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 0) {
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
      } else {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
      }
      data[i + 3] = 255;
    }

    tempCtx.putImageData(imageData, 0, 0);

    return tempCanvas.toDataURL('image/png').split(',')[1];
  }
}