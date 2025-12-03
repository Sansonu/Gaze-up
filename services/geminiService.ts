import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateAppContent = async (context: string, appName: string) => {
  try {
    const modelId = "gemini-2.5-flash"; // Fast model for UI interactions
    
    let prompt = "";
    
    if (appName === "mail") {
      prompt = "Generate a list of 3 fictional, futuristic emails for a user named 'Commander'. Return valid JSON with array of objects having keys: 'from', 'subject', 'preview'. Do not use markdown blocks.";
    } else if (appName === "weather") {
      prompt = "Generate a futuristic weather report for 'Neo Tokyo' sector 7. Return valid JSON object with keys: 'temp', 'condition', 'forecast' (short string). Do not use markdown blocks.";
    } else if (appName === "assistant") {
      prompt = `You are GazeOS, a helpful AI operating system. The user asks: "${context}". Keep the answer short (max 30 words) and helpful.`;
    } else {
      prompt = `Generate placeholder content for an app named ${appName}. Short text.`;
    }

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return JSON.stringify({ error: "Comms Offline" });
  }
};