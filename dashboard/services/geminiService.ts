import { GoogleGenAI } from "@google/genai";
import { AIAnalysisResponse, DashboardState } from "../types";

const parseGeminiResponse = (text: string): AIAnalysisResponse => {
  try {
    // Remove code blocks if present
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Failed to parse Gemini JSON response", e);
    return {
      summary: "Could not analyze data at this time.",
      recommendations: ["Check API Key", "Retry analysis"],
      severity: "low"
    };
  }
};

export const analyzeDashboard = async (
  dashboardState: DashboardState,
  currentMetricsSummary: string
): Promise<AIAnalysisResponse> => {
  
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Please set process.env.API_KEY.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    You are a Senior Site Reliability Engineer (SRE). Analyze the following frontend monitoring dashboard state and metrics summary.
    
    Context:
    - Environment: ${dashboardState.environment}
    - Time Range: ${dashboardState.timeRange}
    
    Current Metrics Data Summary (JSON format):
    ${currentMetricsSummary}

    Task:
    Provide a concise analysis in JSON format ONLY. 
    1. Identify any anomalies (high error rates, slow LCP, etc.).
    2. Provide 3 specific actionable recommendations.
    3. Determine overall system severity level (low, medium, high, critical).

    Response Format (JSON):
    {
      "summary": "One sentence summary of health.",
      "recommendations": ["Action 1", "Action 2", "Action 3"],
      "severity": "low" | "medium" | "high" | "critical"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    return parseGeminiResponse(response.text || "{}");
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};