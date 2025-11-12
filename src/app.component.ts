import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ImageEditorComponent } from './components/image-editor/image-editor.component';
import { TextToImageComponent } from './components/text-to-image/text-to-image.component';
import { ImageRemixComponent } from './components/image-remix/image-remix.component';
import { ToastComponent } from './components/toast/toast.component';

export type Mode = 'home' | 'edit' | 'text2img' | 'remix';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ImageEditorComponent, TextToImageComponent, ImageRemixComponent, ToastComponent]
})
export class AppComponent {
  mode = signal<Mode>('home');

  changeMode(newMode: Mode): void {
    this.mode.set(newMode);
  }
}