from fastapi import FastAPI, HTTPException, status
from db import get_db_connection
from typing import List
from schemas import MidiaResponse, AvaliacaoCreate
app = FastAPI(
    title= "Api de recomendação de filmes",
    description="API de recomendação de filmes",
    version="0.1.0"
)

@app.get("/",tags=["HealthCheack"])
def read_root():
    return {"status":"online","message":"API operando com sucesso"}
@app.get("/midias",response_model=List[MidiaResponse],tags=["Midias"])
def listar_midias(limit: int = 20, offset: int = 0):
    """Retorna lista paginada de todas as midias do banco"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = "SELECT id_tmdb, titulo,sinopse,generos,url_capa FROM midias LIMIT %s OFFSET %s"
            cur.execute(query,(limit,offset))
            return cur.fetchall()
@app.get("/midias/{tipo}/{id_tmdb}",response_model=MidiaResponse,tags=["Midias"])
def obter_midia_por_id(tipo: str, id_tmdb: int):
    """Retorna uma midia especifica baseado no tipo de midia e no id"""
    if tipo not in ["movie","tv"]:
        raise HTTPException(status_code=400, detail="O tipo deve ser 'movie' ou 'tv'")
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = "SELECT id_tmdb, titulo,tipo, sinopse, generos,url_capa FROM midias WHERE id_tmdb = %s AND tipo = %s"
            cur.execute(query,(id_tmdb,tipo))
            midia = cur.fetchone()

            if not midia:
                raise HTTPException(status_code=404,detail="midia não encontrada")
            return midia
@app.get("/midia/search",response_model=List[MidiaResponse],tags=["Midias"])
def obter_midia_por_titulo(titulo: str):
    """Retorna todas as midias que possuem a palavra no titulo"""
    if not titulo:
        raise HTTPException(status_code=400, detail="O campo titulo não pode ser nulo")
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = "SELECT id_tmdb, tipo, titulo, sinopse, url_capa, generos FROM midias WHERE titulo LIKE %s"
            busca = f"%{titulo}%"
            cur.execute(query,(busca,))
            midia = cur.fetchall()
            if not midia:
                raise HTTPException(status_code=404,detail="Midia não encontrada")
            return midia
