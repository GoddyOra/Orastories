
import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async discussChapter(chapterContent: string, userQuery: string) {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `
          CONTEXT: You are the AI Assistant for an author's website. You have access to the current chapter text.
          CHAPTER TEXT: "${chapterContent.substring(0, 4000)}"
          
          USER QUESTION: "${userQuery}"
          
          INSTRUCTION: Answer as a sophisticated literary companion. Use a Dark Academia tone (erudite, slightly mysterious, respectful). Focus on themes, symbols, and literary analysis.
        `
      });
      return response.text;
    } catch (error) {
      console.error("Gemini Error:", error);
      return "The ink seems to have dried for a moment. Please try asking your question again later.";
    }
  }
}
