import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

// Initialize the AI
const getAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY") {
    throw new Error("Gemini API Key is missing. Please set GEMINI_API_KEY in your environment variables.");
  }
  return new GoogleGenAI({ apiKey: key });
};

export interface Post {
  key: string;
  d: number;
  plt: string;
  niche: string;
  ct: string;
  hook: string;
  cap: string;
  cta: string;
  tags: string[];
}

export interface MonthlyPlanRequest {
  platform: string;
  niche: string;
  contentTypes: string[];
  frequency: number;
  month: string;
  year: number;
  theme?: string;
  tone?: string;
}

export class GeminiService {
  /**
   * Generates a full month of content strategy.
   * Uses Gemini 3.1 Pro for high-level reasoning.
   */
  static async generateMonthlyPlan(req: MonthlyPlanRequest): Promise<Post[]> {
    try {
      const ai = getAI();
      const prompt = `
      You are a world-class Social Media Strategist. 
      Plan a content calendar for ${req.month} ${req.year}.
      
      PLATFORM: ${req.platform}
      NICHE: ${req.niche}
      CONTENT TYPES TO ROTATE: ${req.contentTypes.join(", ")}
      FREQUENCY: ${req.frequency} posts per week.
      THEME: ${req.theme || "Balanced growth"}
      TONE: ${req.tone || "Professional and engaging"}
      
      STRATEGY GOALS:
      1. Narrative Progression: Move the audience from awareness to trust.
      2. Variety: Use different emotional triggers (curiosity, authority, empathy).
      3. No Repetition: Every post must feel fresh and unique.
      4. Platform Native: Use hooks and formats optimized for ${req.platform}.
      5. Viral Potential: Include at least 2 "contrarian" or "hot take" ideas to spark debate.
      6. Actionable Value: Ensure educational posts have clear, step-by-step takeaways.
      
      IDEAS FOR VARIETY:
      - Behind the scenes / Day in the life
      - Common myths in the ${req.niche} niche
      - "How I started" vs "How it's going"
      - Quick tips / Life hacks
      - Industry news commentary
      
      IMPORTANT: Keep hooks and captions concise but high-impact. Captions should be under 300 characters.
      
      Return a JSON array of post objects for the scheduled days.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              d: { type: Type.INTEGER, description: "Day of the month (1-31)" },
              ct: { type: Type.STRING, description: "Content type from the requested list" },
              hook: { type: Type.STRING },
              cap: { type: Type.STRING, description: "The main caption body" },
              cta: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["d", "ct", "hook", "cap", "cta", "tags"]
          }
        }
      }
    });

    } catch (e: any) {
      console.error("Gemini API error:", e);
      if (e.message?.includes("fetch") || e.name === "TypeError") {
        console.warn("Using Mock AI data due to connection issues.");
        // Generate mock posts based on frequency
        const posts: Post[] = [];
        const days = [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26, 29]; // Example days
        const count = Math.min(days.length, req.frequency * 4);
        
        for (let i = 0; i < count; i++) {
          const ct = req.contentTypes[i % req.contentTypes.length];
          posts.push({
            d: days[i],
            ct,
            hook: `[Offline Mode] How to master ${req.niche} on ${req.platform}`,
            cap: `This is a sample post generated while offline. Once your connection is restored, you can regenerate for real AI content! Focus on ${req.niche} and use ${ct} to engage your audience.`,
            cta: `Follow for more ${req.niche} tips!`,
            tags: [req.niche.replace(/\s+/g, ''), req.platform.toLowerCase(), 'growth'],
            key: `${req.year}-${String(new Date(`${req.month} 1, ${req.year}`).getMonth() + 1).padStart(2, '0')}-${String(days[i]).padStart(2, '0')}`,
            plt: req.platform,
            niche: req.niche
          });
        }
        return posts;
      }
      throw e;
    }
  }

  /**
   * AI Assistant for chat and post refinement.
   * Uses Gemini 3 Flash for low latency.
   */
  static async chat(message: string, context: any): Promise<string> {
    try {
      const ai = getAI();
      const systemInstruction = `
      You are the SocialTrackr AI Growth Assistant. 
      You help users grow on ${context.plt} in the ${context.niche} niche.
      
      CURRENT CONTEXT:
      - Platform: ${context.plt}
      - Niche: ${context.niche}
      - Content Types: ${context.cts?.join(", ")}
      - Recent Performance: ${JSON.stringify((context.metrics || []).slice(-10))}
      
      TONE: Professional, encouraging, data-driven, and highly actionable.
      
      CAPABILITIES:
      - Improve hooks (make them more "viral" or "curiosity-driven")
      - Rewrite captions for better engagement
      - Analyze metrics to suggest strategy shifts
      - Break down carousels into slide-by-slide instructions
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: message,
      config: {
        systemInstruction
      }
    });

    } catch (e: any) {
      console.error("Gemini Chat error:", e);
      if (e.message?.includes("fetch") || e.name === "TypeError") {
        return "I'm currently in Offline Mode because I can't reach the AI servers. I can still help you with basic advice, but my advanced reasoning is limited. Try checking your internet connection!";
      }
      return "I'm sorry, I encountered an error: " + e.message;
    }
  }
}
