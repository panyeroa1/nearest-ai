
export interface Location {
  lat: number;
  lng: number;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface Blip {
  id: string;
  distanceFactor: number; // 0 to 1 (relative to radius)
  angle: number; // 0 to 360 degrees
  title: string;
}

export interface ReconImage {
  url: string;
  caption: string;
}

export interface TargetProfile {
  name: string;
  phone?: string;
  summary: string;
  eta?: string;
  heading?: string;
  owner?: string;
  bio?: string;
  credentials?: string[];
  socials?: string[];
  fastestRouteUrl?: string;
}

export interface SearchResult {
  text: string;
  sources: GroundingSource[];
  isThinking: boolean;
  blips?: Blip[];
  images?: ReconImage[];
  profile?: TargetProfile;
  groundingLinks?: GroundingSource[];
}

export interface VoiceState {
  isListening: boolean;
  transcript: string;
}
