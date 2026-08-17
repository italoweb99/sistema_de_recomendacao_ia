from fastapi import FastAPI, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import psycopg2
from psycopg2.extras import RealDictCursor

app = FastAPI(title="KPlus API - Recomendador Híbrido Triplo")

# Carrega o modelo multilíngue na inicialização da API
model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

def get_db_connection():
    return psycopg2.connect(
        dbname="seu_banco",
        user="seu_usuario",
        password="sua_password",
        host="localhost",
        port="5432",
        cursor_factory=RealDictCursor
    )

class MidiaResponse(BaseModel):
    id_tmdb: int
    tipo: str
    titulo: str
    sinopse: Optional[str] = None
    generos: Optional[str] = None
    url_capa: Optional[str] = None
    score_final: Optional[float] = None

@app.get("/midias/recomendar", response_model=List[MidiaResponse], tags=["Recomendação Híbrida"])
def recomendar_midias(
    usr_query: Optional[str] = Query(None, description="Termo de busca digitado pelo usuário"),
    usuario_id: Optional[int] = Query(None, description="ID do usuário logado (opcional)"),
    limit: int = Query(10, ge=1, le=50),
    peso_semantico: float = 0.5,
    peso_textual: float = 0.2,
    peso_colaborativo: float = 0.3
):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            
            # CENÁRIO A: O Usuário fez uma busca (Query Ativa)
            if usr_query and usr_query.strip():
                embedded_query = model.encode(usr_query).tolist()
                
                # Se não houver usuario_id, zera o peso colaborativo para não distorcer a busca
                w_colab = peso_colaborativo if usuario_id else 0.0

                query_hibrida = """
                    WITH busca_semantica AS (
                        SELECT 
                            id_tmdb, tipo,
                            (1 - (embedding <=> %s::vector)) AS score_semantico
                        FROM midias
                        WHERE embedding IS NOT NULL
                        ORDER BY embedding <=> %s::vector
                        LIMIT 50
                    ),
                    busca_textual AS (
                        SELECT 
                            id_tmdb, tipo,
                            ts_rank(fts_vector, plainto_tsquery('portuguese', %s)) AS score_textual
                        FROM midias
                        WHERE fts_vector @@ plainto_tsquery('portuguese', %s)
                        LIMIT 50
                    ),
                    predicao_colaborativa AS (
                        -- Nota média normalizada (de 0.0 a 1.0) para sinal colaborativo
                        SELECT 
                            id_tmdb, tipo,
                            (COALESCE(AVG(nota), 3.0) / 5.0) AS score_colaborativo
                        FROM avaliacoes
                        GROUP BY id_tmdb, tipo
                    )
                    SELECT 
                        m.id_tmdb, m.tipo, m.titulo, m.sinopse, m.generos, m.url_capa,
                        (
                            COALESCE(bs.score_semantico, 0) * %s + 
                            COALESCE(bt.score_textual, 0) * %s + 
                            COALESCE(pc.score_colaborativo, 0.6) * %s
                        ) AS score_final
                    FROM midias m
                    LEFT JOIN busca_semantica bs ON m.id_tmdb = bs.id_tmdb AND m.tipo = bs.tipo
                    LEFT JOIN busca_textual bt ON m.id_tmdb = bt.id_tmdb AND m.tipo = bt.tipo
                    LEFT JOIN predicao_colaborativa pc ON m.id_tmdb = pc.id_tmdb AND m.tipo = pc.tipo
                    WHERE bs.id_tmdb IS NOT NULL OR bt.id_tmdb IS NOT NULL
                    ORDER BY score_final DESC
                    LIMIT %s;
                """
                
                cur.execute(query_hibrida, (
                    embedded_query, embedded_query,
                    usr_query, usr_query,
                    peso_semantico, peso_textual, w_colab,
                    limit
                ))

            # CENÁRIO B: Nenhuma busca digitada (Carregamento da Home Page / Feed)
            else:
                if usuario_id:
                    # Recomenda mídias bem avaliadas por outros usuários que o usuário atual ainda não avaliou
                    query_feed = """
                        SELECT 
                            m.id_tmdb, m.tipo, m.titulo, m.sinopse, m.generos, m.url_capa,
                            (COALESCE(AVG(a.nota), 3.0) / 5.0) AS score_final
                        FROM midias m
                        JOIN avaliacoes a ON m.id_tmdb = a.id_tmdb AND m.tipo = a.tipo
                        WHERE m.id_tmdb NOT IN (
                            SELECT id_tmdb FROM avaliacoes WHERE usuario_id = %s
                        )
                        GROUP BY m.id_tmdb, m.tipo, m.titulo, m.sinopse, m.generos, m.url_capa
                        ORDER BY score_final DESC
                        LIMIT %s;
                    """
                    cur.execute(query_feed, (usuario_id, limit))
                else:
                    # Feed genérico para visitantes não logados (Mídias populares/bem avaliadas)
                    query_feed = """
                        SELECT 
                            m.id_tmdb, m.tipo, m.titulo, m.sinopse, m.generos, m.url_capa,
                            (COALESCE(AVG(a.nota), 3.0) / 5.0) AS score_final
                        FROM midias m
                        LEFT JOIN avaliacoes a ON m.id_tmdb = a.id_tmdb AND m.tipo = a.tipo
                        GROUP BY m.id_tmdb, m.tipo, m.titulo, m.sinopse, m.generos, m.url_capa
                        ORDER BY score_final DESC
                        LIMIT %s;
                    """
                    cur.execute(query_feed, (limit,))

            resultados = cur.fetchall()
            return resultados