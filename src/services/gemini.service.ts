import { Injectable, inject, signal } from '@angular/core';
import { GoogleGenAI } from '@google/genai';
import { ToastService } from './toast.service';

// This is a placeholder for the environment variable.
declare var process: any;

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private toastService = inject(ToastService);
  private ai: GoogleGenAI | null = null;

  constructor() {
    try {
      if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      } else {
        throw new Error("API_KEY environment variable not found.");
      }
    } catch (e: any) {
      const message = e.message || "Failed to initialize the AI service. Please ensure the API key is set.";
      console.error("Failed to initialize GoogleGenAI:", e);
      this.toastService.showError(message);
    }
  }

  private async fileToBase64(file: File): Promise<{base64: string, mimeType: string}> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const mimeType = result.split(';')[0].split(':')[1];
        const base64 = result.split(',')[1];
        resolve({base64, mimeType});
      };
      reader.onerror = (error) => reject(error);
    });
  }

  private async describeImage(imageFile: File, systemInstruction: string): Promise<string | null> {
    if (!this.ai) {
      this.toastService.showError("AI服务未初始化。");
      return null;
    }
    try {
      const { base64, mimeType } = await this.fileToBase64(imageFile);
      const imagePart = {
        inlineData: { mimeType, data: base64 },
      };
      
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart] },
        config: { systemInstruction }
      });
      return response.text.trim();
    } catch (e: any) {
        const message = e.message || "分析参考图像时出错。";
        console.error("Error during image description:", e);
        this.toastService.showError(message);
        return null;
    }
  }

  async optimizePrompt(currentPrompt: string): Promise<string | null> {
    if (!this.ai) {
        this.toastService.showError("AI服务未初始化。请检查API密钥。");
        return null;
    }
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: currentPrompt,
        config: {
            systemInstruction: "你是一位顶尖的AI绘画提示词工程师，一位视觉叙事大师。你的任务是将用户输入的简短中文想法，扩展成一个结构化、极其详细、富有画面感的专业级中文提示词。严格遵循以下规则：1. **核心主题**: 首先明确描述核心主体和动作。2. **丰富细节**: 生动地描绘主体的外观、情绪、服装等细节。3. **构建场景**: 详细描述环境、背景和氛围。4. **定义艺术风格**: 具体说明艺术风格（如：照片级真实感、动漫、油画）、光照（如：电影感光照、柔光、霓虹灯）、色彩方案和摄影细节（如：相机视角、镜头类型，例如低角度拍摄、广角镜头）。5. **输出**: 只返回优化后的中文提示词，不要包含任何额外的解释、标题或引号。",
        }
      });
      return response.text.trim();
    } catch (e: any) {
      const message = e.message || "优化提示词时发生未知错误。";
      console.error("Error during prompt optimization:", e);
      this.toastService.showError(message);
      return null;
    }
  }

  private async translateToEnglish(text: string): Promise<string | null> {
    if (!this.ai) {
        this.toastService.showError("AI服务未初始化。");
        return null;
    }
    try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: text,
            config: {
                systemInstruction: "你是一个专业的翻译家。将以下中文文本翻译成英文。只输出翻译后的英文文本，不要任何额外的解释、标签或引号。",
            }
        });
        return response.text.trim();
    } catch (e: any) {
        const message = e.message || "将提示词翻译成英文时出错。";
        console.error("Error during translation:", e);
        this.toastService.showError(message);
        return null;
    }
  }

  async generateImageFromText(
    prompt: string, 
    negativePrompt?: string | null, 
    aspectRatio?: string | null,
    stylePrompt?: string | null,
    referenceImageFile?: File | null,
    seed?: number | null
  ): Promise<string | null> {
    if (!this.ai) {
        this.toastService.showError("AI服务未初始化。请检查API密钥。");
        return null;
    }

    try {
        let finalChinesePrompt = prompt;

        if (referenceImageFile) {
          const characterInstruction = "你是一个图像分析专家。请详细描述图像中的核心主体（人物或物体）的视觉特征，重点描述那些可以用于在其他场景中重新生成该主体的关键细节（如发型、服装、颜色、风格等）。描述应简洁、准确，并以一个名词短语的形式呈现。例如：'一个穿着红色连衣裙的金发女孩'或'一辆复古的蓝色跑车'。";
          const characterDescription = await this.describeImage(referenceImageFile, characterInstruction);
          if (characterDescription) {
            finalChinesePrompt = `${characterDescription}，${prompt}`;
          } else {
            return null; // Error handled in describeImage
          }
        }

        const englishPromptBody = await this.translateToEnglish(finalChinesePrompt);
        if (!englishPromptBody) return null;
        
        let finalEnglishPrompt = englishPromptBody;
        
        if (stylePrompt) {
          finalEnglishPrompt = `${finalEnglishPrompt}, ${stylePrompt}`;
        }
        
        const qualitySuffix = ", masterpiece, best quality, ultra-detailed, 8k, cinematic lighting, sharp focus, intricate details";
        finalEnglishPrompt = `${finalEnglishPrompt}${qualitySuffix}`;

        if (negativePrompt) {
            const englishNegativePrompt = await this.translateToEnglish(negativePrompt);
            if (englishNegativePrompt) {
                // Using a common convention for negative prompts
                finalEnglishPrompt = `${finalEnglishPrompt}, negative prompt: ${englishNegativePrompt}`;
            }
        }

        const imageConfig: any = {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
        };
        if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
        if (seed) imageConfig.seed = seed;

        const imageResponse = await this.ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: finalEnglishPrompt,
            config: imageConfig,
        });

        if (imageResponse.generatedImages?.length) {
            this.toastService.showSuccess("图像生成成功！");
            const newImageBase64 = imageResponse.generatedImages[0].image.imageBytes;
            return `data:image/jpeg;base64,${newImageBase64}`;
        } else {
            throw new Error("AI未能返回图像。");
        }
    } catch (e: any) {
        const message = e.message || "从文本生成图像时发生未知错误。";
        console.error("Error during text-to-image generation:", e);
        this.toastService.showError(message);
        return null;
    }
  }

  async generateEditedImage(
    imageFile: File,
    editPrompt: string,
    maskBase64?: string | null,
    referenceImageFile?: File | null,
    negativePrompt?: string | null,
    seed?: number | null
  ): Promise<{ imageUrl: string; description: string } | null> {
    // Note: The gemini-2.5-flash-image model used for inpainting doesn't
    // currently support a seed parameter in the same way imagen does.
    // The parameter is included for signature consistency but is unused in the API call.
    if (!this.ai) {
        this.toastService.showError("AI服务未初始化。请检查API密钥。");
        return null;
    }

    try {
      let finalChinesePrompt = editPrompt;

      if (referenceImageFile) {
        const characterInstruction = "你是一个图像分析专家。请详细描述图像中的核心主体（人物或物体）的视觉特征，重点描述那些可以用于在其他场景中重新生成该主体的关键细节（如发型、服装、颜色、风格等）。描述应简洁、准确，并以一个名词短语的形式呈现。例如：'一个穿着红色连衣裙的金发女孩'或'一辆复古的蓝色跑车'。";
        const characterDescription = await this.describeImage(referenceImageFile, characterInstruction);
        if (characterDescription) {
          finalChinesePrompt = `${characterDescription}，${editPrompt}`;
        } else {
          return null; // Error handled in describeImage
        }
      }

      if (negativePrompt) {
        finalChinesePrompt = `${finalChinesePrompt}，排除 ${negativePrompt}`;
      }
      
      const englishPrompt = await this.translateToEnglish(finalChinesePrompt);
      if(!englishPrompt) return null;

      const qualityKeywords = "Ensure the output is masterpiece, best quality, ultra-detailed, 4k, with cinematic lighting, sharp focus, and intricate details.";
      const finalPromptForModel = `${englishPrompt}. ${qualityKeywords}`;

      const { base64: imageBase64, mimeType } = await this.fileToBase64(imageFile);
      const imagePart = { inlineData: { mimeType, data: imageBase64 } };
      
      const contents: any[] = [finalPromptForModel, imagePart];

      if (maskBase64) {
        const maskPart = { inlineData: { mimeType: 'image/png', data: maskBase64 } };
        const maskInstruction = "You are a professional image editor. Here is an original image, a black and white mask, and a text instruction. Your task is to modify ONLY the parts of the original image that correspond to the WHITE areas of the mask. The BLACK areas must remain completely unchanged. Strictly follow the text instruction to modify the white areas.";
        contents.unshift(maskInstruction);
        contents.push(maskPart);
      }
      
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: contents,
      });

      const imageResult = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

      if (imageResult?.inlineData) {
        this.toastService.showSuccess("图像编辑成功！");
        const newImageBase64 = imageResult.inlineData.data;
        const newMimeType = imageResult.inlineData.mimeType;
        const imageUrl = `data:${newMimeType};base64,${newImageBase64}`;

        const descriptionPrompt = `这是刚刚根据用户指令“${editPrompt}”编辑生成的图片。请你：
1. 对这张新图片进行一段生动、富有想象力的描述。
2. 提出2-3个简短、可操作的后续修改建议，引导用户继续创作。

请严格按照以下格式返回，不要添加任何其他无关内容：
[DESCRIPTION]
这里是图片的描述文字。
[SUGGESTIONS]
- 第一个建议
- 第二个建议
- 第三个建议`;
        
        try {
            const descImagePart = { inlineData: { mimeType: newMimeType, data: newImageBase64 } };
            const descTextPart = { text: descriptionPrompt };

            const descriptionResponse = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [descTextPart, descImagePart] }
            });
            const description = descriptionResponse.text.trim();
            return { imageUrl, description };
        } catch(e: any) {
            console.error("Error generating image description:", e);
            const defaultDescription = `已成功应用修改：“${editPrompt}”`;
            return { imageUrl, description: defaultDescription };
        }

      } else {
        const textResponse = response.text?.trim();
        if (textResponse) {
          throw new Error(`AI返回了文本而非图像: ${textResponse}`);
        }
        throw new Error("AI未能返回新图像。");
      }
    } catch (e: any) {
      const message = e.message || "生成图像时发生未知错误。";
      console.error("Error during image generation:", e);
      this.toastService.showError(message);
      return null;
    }
  }

  async remixImage(
      contentFile: File, 
      styleFile: File,
      prompt: string,
      negativePrompt?: string | null,
      aspectRatio?: string | null,
      seed?: number | null
  ): Promise<string | null> {
      try {
        const contentInstruction = "你是一个图像分析专家。请用简洁的名词短语描述这张图片的主要内容。例如：'一只狗在公园里'或'一个山顶上的城堡'。";
        const contentDescription = await this.describeImage(contentFile, contentInstruction);
        if (!contentDescription) return null;

        const styleInstruction = "你是一个艺术评论家。请用简洁的短语描述这张图片的艺术风格、媒介、光照和色彩。例如：'采用柔和色调的印象派油画'或'赛博朋克风格的数字艺术，充满霓虹灯光'。";
        const styleDescription = await this.describeImage(styleFile, styleInstruction);
        if (!styleDescription) return null;

        let finalPrompt = `${contentDescription}，${prompt}，艺术风格为 ${styleDescription}`;

        return await this.generateImageFromText(finalPrompt, negativePrompt, aspectRatio, null, null, seed);
      } catch (e: any) {
        const message = e.message || "图像融合时发生未知错误。";
        console.error("Error during image remix:", e);
        this.toastService.showError(message);
        return null;
      }
  }
}