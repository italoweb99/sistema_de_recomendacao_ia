export interface Midia {
  id: number;
  titulo: string;
  ano?: number;
  tipo?: string;
  url_capa?: string;
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
  score: number;
}

export interface Metricas {
  totalEsperado: number;
  acertos: number;
  recallAt12: string;
}