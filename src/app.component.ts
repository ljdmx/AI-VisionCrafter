import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { ImageEditorComponent } from './components/image-editor/image-editor.component';
import { TextToImageComponent } from './components/text-to-image/text-to-image.component';
import { ImageRemixComponent } from './components/image-remix/image-remix.component';
import { ToastComponent } from './components/toast/toast.component';
import { ApiKeyModalComponent } from './components/api-key-modal/api-key-modal.component';
import { GeminiService } from './services/gemini.service';

export type Mode = 'home' | 'edit' | 'text2img' | 'remix';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ImageEditorComponent, 
    TextToImageComponent, 
    ImageRemixComponent, 
    ToastComponent,
    ApiKeyModalComponent
  ]
})
export class AppComponent {
  mode = signal<Mode>('home');

  // Inject GeminiService here to ensure it's instantiated on app bootstrap,
  // which triggers the API key check.
  constructor() {
    inject(GeminiService);
  }

  changeMode(newMode: Mode): void {
    this.mode.set(newMode);
  }
}
