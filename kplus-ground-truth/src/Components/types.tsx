export interface Midia {
  id: number;
  id_tmdb?: number;
  titulo: string;
  ano?: number;
  tipo?: string;
  url_capa?: string;
  sinopse?: string;
  generos?: string;
  score?: number;
  score_final?: number;
}

export interface CasoDeTeste {
  id: number;
  usuario_id: string;
  query: string;
  midias_esperadas: Midia[];
}

export interface Pesos {
  semantico: number;
  textual: number;
  colaborativo: number;
}

export interface RecomendacaoResultado {
  id: number;
  titulo: string;
  tipo?: string;
  sinopse?: string;
  generos?: string;
  url_capa?: string;
  score: number;
}

export interface Metricas {
  totalEsperado: number;
  acertos: number;
  recallAt12: string;
}

export interface ApiInspectorData {
  url: string;
  method: string;
  status: number | null;
  statusText?: string;
  durationMs: number;
  requestParams: Record<string, string>;
  responsePayload: unknown;
  timestamp: string;
}