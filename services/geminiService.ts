
import { GoogleGenAI, Modality } from "@google/genai";
import { SearchResult, Location, ReconImage, TargetProfile, GroundingSource } from "../types";

const API_KEY = process.env.API_KEY || '';

export const getGeminiClient = () => {
  return new GoogleGenAI({ apiKey: API_KEY });
};

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
      contents: `DEEP SCAN INITIATED: Find the nearest ${query} within ${radius}km. 
      
      PHASE 1 (GEO-LOC): Pinpoint exact establishment.
      PHASE 2 (INTEL): Use Google Search Grounding to extract:
      - Name of owner/proprietor or head professional (e.g. Lead Surgeon, Head Chef).
      - Professional biography or educational background of the lead staff.
      - Factual public records regarding establishment history.
      - Official contact methods.
      
      Respond in an authoritative tactical dossier format in the user's language.
      
      At the end of your response, include this EXACT JSON block:
      METADATA: {"name": "Place Name", "phone": "Phone", "summary": "Brief factual summary", "eta": "Calculated travel time", "heading": "Bearing (e.g. N)", "owner": "Owner/Lead Name", "bio": "Professional biography summary", "credentials": ["Fact 1", "Fact 2"], "fastestRouteUrl": "https://www.google.com/maps/dir/?api=1&destination=LAT,LNG"}
      `,
      config: {
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
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

    let fullText = response.text || "Signal interrupted.";
    let profile: TargetProfile | undefined;

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
    const groundingLinks: GroundingSource[] = chunks
      .map((c: any) => {
        if (c.maps) return { title: c.maps.title || "Map Link", uri: c.maps.uri };
        if (c.web) return { title: c.web.title || "Reference", uri: c.web.uri };
        return null;
      })
      .filter((l): l is GroundingSource => l !== null);

    const sources = groundingLinks.filter(l => l.uri.includes('google.com/maps'));

    return { text: fullText, sources, isThinking: false, profile, groundingLinks };
  } catch (error) {
    console.error("Deep search failure:", error);
    return { text: "Tactical data link severed.", sources: [], isThinking: false };
  }
};

export const generateReconImage = async (placeName: string, query: string): Promise<ReconImage | undefined> => {
  const ai = getGeminiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `A futuristic tactical reconnaissance satellite scan showing the building of "${placeName}". High-contrast, thermal filters, digital triangulation lines, 4K resolution, cinematic lighting.` }],
      },
      config: { imageConfig: { aspectRatio: "16:9" } },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return {
          url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          caption: `SATELLITE LOCK: ${placeName}`
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
      contents: [{ parts: [{ text: `Attention. ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    return undefined;
  }
};
