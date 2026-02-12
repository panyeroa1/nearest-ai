
import { GoogleGenAI, Modality } from "@google/genai";
import { SearchResult, Location, ReconImage, TargetProfile } from "../types";

const API_KEY = process.env.API_KEY || '';

export const getGeminiClient = () => {
  return new GoogleGenAI({ apiKey: API_KEY });
};

/**
 * Decodes raw PCM audio data from Gemini TTS
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Simple Base64 decoder
 */
export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export const fetchNearestWithMaps = async (
  query: string,
  location: Location,
  radius: number
): Promise<SearchResult> => {
  const ai = getGeminiClient();
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Find the nearest ${query} within ${radius}km. 
      
      CRITICAL INSTRUCTION: Detect the language of the query "${query}". 
      You MUST respond in the EXACT same language as the user's query. 
      If the query is too short to detect, use the native language of the region at lat ${location.lat}, lng ${location.lng}.
      
      Provide a DETAILED tactical summary briefing for the user including distance, name, and a brief description.
      
      At the end of your response, you MUST include a line formatted EXACTLY as:
      METADATA: {"name": "Exact Name", "phone": "Contact Number or N/A", "summary": "Quick tactical summary", "eta": "Calculated travel time (e.g. 5m)", "heading": "Direction from user (e.g. NW)"}
      
      Respond in an authoritative, professional tactical style.`,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: location.lat,
              longitude: location.lng,
            },
          },
        },
      },
    });

    let fullText = response.text || "No target signatures detected in current radius.";
    let profile: TargetProfile | undefined;

    // Parse Metadata
    const metaMatch = fullText.match(/METADATA:\s*({.*})/);
    if (metaMatch) {
      try {
        profile = JSON.parse(metaMatch[1]);
        fullText = fullText.replace(metaMatch[0], "").trim();
      } catch (e) {
        console.error("Metadata parse error", e);
      }
    }

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .filter((c: any) => c.maps)
      .map((c: any) => ({
        title: c.maps.title || "Target Identified",
        uri: c.maps.uri,
      }));

    return { text: fullText, sources, isThinking: false, profile };
  } catch (error) {
    console.error("Maps search error:", error);
    return { 
      text: "Radar uplink failure. Check satellite connection.", 
      sources: [], 
      isThinking: false 
    };
  }
};

/**
 * Generates a tactical visual representation of a location
 */
export const generateReconImage = async (placeName: string, query: string): Promise<ReconImage | undefined> => {
  const ai = getGeminiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: `A high-tech tactical reconnaissance satellite view showing the location of "${placeName}". Dramatic bird's-eye view, futuristic red/green map markers, data-stream overlays, digital triangulation lines showing the path to the target. Blueprint aesthetics.` },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return {
          url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          caption: `RECON SCAN: ${placeName}`
        };
      }
    }
  } catch (error) {
    console.error("Image generation error:", error);
  }
  return undefined;
};

export const generateSpeech = async (text: string): Promise<string | undefined> => {
  const ai = getGeminiClient();
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ 
        parts: [{ 
          text: `Read this tactical briefing clearly and authoritatively in its native language: "${text}"` 
        }] 
      }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Zephyr' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("TTS generation error:", error);
    return undefined;
  }
};
