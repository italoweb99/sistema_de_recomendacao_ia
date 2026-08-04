from fastapi import FastAPI, HTTPException, status
from db import get_db_connection
from typing import List
from schemas import MidiaResponse, AvaliacaoCreate
from sentence_transformers import SentenceTransformer

app = FastAPI(
    title="Api de recomendação de filmes",
    description="API de recomendação de filmes para o TCC",
    version="0.1.0"
)

# CARREGAMENTO GLOBAL DO MODELO: Carrega uma vez na inicialização da API, economizando memória e CPU
print("Carregando modelo SentenceTransformer...")
model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
print("Modelo carregado com sucesso!")


@app.get("/", tags=["HealthCheck"])
def read_root():
    return {"status": "online", "message": "API operando com sucesso"}


# 1. ROTAS FIXAS / ESPECÍFICAS PRIMEIRO (Evita conflito com os parâmetros dinâmicos)

@app.get("/midias/search", response_model=List[MidiaResponse], tags=["Midias"])
def obter_midia_por_titulo(titulo: str):
    """Retorna todas as mídias que possuem a palavra informada no título."""
    if not titulo:
        raise HTTPException(status_code=400, detail="O campo titulo não pode ser nulo")
        
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Adicionado 'tipo' no SELECT para satisfazer o MidiaResponse
            query = "SELECT id_tmdb, tipo, titulo, sinopse, url_capa, generos FROM midias WHERE titulo ILIKE %s"
            busca = f"%{titulo}%" # ILIKE no Postgres ignora maiúsculas/minúsculas
            cur.execute(query, (busca,))
            midia = cur.fetchall()
            
            if not midia:
                raise HTTPException(status_code=404, detail="Nenhuma mídia encontrada com esse título")
            return midia


@app.get("/midias/aisearch", response_model=List[MidiaResponse], tags=["Midias"])
def obter_midia_ia(usr_query: str, limit: int = 10):
    """Retorna a busca do usuário utilizando IA (Busca Semântica via Embeddings)."""
    if not usr_query:
        raise HTTPException(status_code=400, detail="A consulta de busca não pode ser vazia")

    # Utiliza o modelo já carregado globalmente (resposta em milissegundos)
    embedded_query = model.encode(usr_query).tolist()
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT id_tmdb, tipo, titulo, sinopse, url_capa, generos 
                FROM midias 
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector 
                LIMIT %s
            """
            cur.execute(query, (embedded_query, limit))
            midia = cur.fetchall()
            
            if not midia:
                raise HTTPException(status_code=404, detail="Nenhuma mídia encontrada na busca semântica")
            return midia


# 2. ROTAS GENÉRICAS / DINÂMICAS POR ÚLTIMO

@app.get("/midias", response_model=List[MidiaResponse], tags=["Midias"])
def listar_midias(limit: int = 20, offset: int = 0):
    """Retorna lista paginada de todas as mídias do banco."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Adicionado 'tipo' no SELECT para alinhar com o schema de resposta
            query = "SELECT id_tmdb, tipo, titulo, sinopse, generos, url_capa FROM midias LIMIT %s OFFSET %s"
            cur.execute(query, (limit, offset))
            return cur.fetchall()


@app.get("/midias/{tipo}/{id_tmdb}", response_model=MidiaResponse, tags=["Midias"])
def obtener_midia_por_id(tipo: str, id_tmdb: int):
    """Retorna uma mídia específica baseado no tipo (movie ou tv) e no id_tmdb."""
    if tipo not in ["movie", "tv"]:
        raise HTTPException(status_code=400, detail="O tipo deve ser 'movie' ou 'tv'")
        
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = "SELECT id_tmdb, tipo, titulo, sinopse, generos, url_capa FROM midias WHERE id_tmdb = %s AND tipo = %s"
            cur.execute(query, (id_tmdb, tipo))
            midia = cur.fetchone()

            if not midia:
                raise HTTPException(status_code=404, detail="Mídia não encontrada")
            return midia