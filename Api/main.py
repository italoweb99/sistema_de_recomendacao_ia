from fastapi import FastAPI, HTTPException, Query, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from typing import List, Optional
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
import psycopg2
from psycopg2.extras import RealDictCursor
from schemas import (MidiaResponse,UsuarioCadastro,TokenResponse,AvaliacaoSchema)
from dotenv import load_dotenv
import os
load_dotenv()
# Importa as funções do módulo de autenticação
from auth import (
    verificar_senha, 
    gerar_hash_senha, 
    criar_access_token, 
    obter_usuario_logado_id,
    oauth2_scheme
)

app = FastAPI(title="KPlus API - Recomendador Híbrido Triplo com Autenticação")

model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

def get_db_connection():
    return psycopg2.connect(
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        cursor_factory=RealDictCursor
    )


# -----------------------------------------------------------------------------
# ROTAS DE AUTENTICAÇÃO (LOGIN / REGISTRO)
# -----------------------------------------------------------------------------
@app.post("/auth/register", status_code=status.HTTP_201_CREATED, tags=["Autenticação"])
def cadastrar_usuario(dados: UsuarioCadastro):
    senha_hash = gerar_hash_senha(dados.senha)
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Verifica duplicidade de e-mail
            cur.execute("SELECT id FROM usuarios WHERE email = %s;", (dados.email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado.")
            
            # Insere usuário
            cur.execute(
                "INSERT INTO usuarios (nome, email, senha_hash) VALUES (%s, %s, %s) RETURNING id;",
                (dados.nome, dados.email, senha_hash)
            )
            novo_id = cur.fetchone()["id"]
            conn.commit()
            
            # Gera Token automático pós-cadastro
            token = criar_access_token(data={"sub": str(novo_id)})
            return {"access_token": token, "token_type": "bearer", "usuario_id": novo_id, "nome": dados.nome}


@app.post("/auth/login", response_model=TokenResponse, tags=["Autenticação"])
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Realiza o login. Aceita username (que tratamos como email) e password (OAuth2 standard).
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, nome, senha_hash FROM usuarios WHERE email = %s;", 
                (form_data.username,)
            )
            usr = cur.fetchone()
            
            if not usr or not verificar_senha(form_data.password, usr["senha_hash"]):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="E-mail ou senha incorretos.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            token = criar_access_token(data={"sub": str(usr["id"])})
            return {
                "access_token": token,
                "token_type": "bearer",
                "usuario_id": usr["id"],
                "nome": usr["nome"]
            }


# -----------------------------------------------------------------------------
# ROTA DE AVALIAÇÃO (PROTEGIDA POR TOKEN)
# -----------------------------------------------------------------------------
@app.post("/midias/avaliar", status_code=status.HTTP_200_OK, tags=["Avaliações"])
def avaliar_midia(
    dados: AvaliacaoSchema,
    usuario_id: int = Depends(obter_usuario_logado_id)  # Valida o token e extrai o ID
):
    """
    Salva ou atualiza a nota de um filme/série feita pelo usuário logado.
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # UPSERT: Se a avaliação já existir (usuario_id, id_tmdb, tipo), atualiza a nota
            query_upsert = """
                INSERT INTO avaliacoes (usuario_id, id_tmdb, tipo, nota, criado_em)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (usuario_id, id_tmdb, tipo) 
                DO UPDATE SET nota = EXCLUDED.nota, criado_em = NOW();
            """
            cur.execute(query_upsert, (usuario_id, dados.id_tmdb, dados.tipo, dados.nota))
            conn.commit()
            
            return {
                "mensagem": "Avaliação salva com sucesso!",
                "usuario_id": usuario_id,
                "id_tmdb": dados.id_tmdb,
                "nota": dados.nota
            }


# -----------------------------------------------------------------------------
# ROTA DE RECOMENDAÇÃO HÍBRIDA
# -----------------------------------------------------------------------------
@app.get("/midias/recomendar", response_model=List[MidiaResponse], tags=["Recomendação Híbrida"])
def recomendar_midias(
    usr_query: Optional[str] = Query(None, description="Termo de busca"),
    limit: int = Query(10, ge=1, le=50),
    peso_semantico: float = 0.5,
    peso_textual: float = 0.2,
    peso_colaborativo: float = 0.3,
    token: Optional[str] = Depends(oauth2_scheme)  # Extrai o token opcional
):
    # Tenta extrair o usuario_id se houver token no Header
    usuario_id = None
    if token:
        try:
            usuario_id = obter_usuario_logado_id(token)
        except HTTPException:
            usuario_id = None

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            
            # CENÁRIO A: Busca Ativa
            if usr_query and usr_query.strip():
                embedded_query = model.encode(usr_query).tolist()
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
                            ts_rank(fts_vector, plainto_tsquery('portuguese', %s)) AS raw_textual
                        FROM midias
                        WHERE fts_vector @@ plainto_tsquery('portuguese', %s)
                        LIMIT 50
                    ),
                    max_textual AS (
                        SELECT COALESCE(MAX(raw_textual), 1.0) AS max_rank FROM busca_textual
                    ),
                    predicao_colaborativa AS (
                        SELECT 
                            id_tmdb, tipo,
                            (COALESCE(AVG(nota), 3.0) / 5.0) AS score_colaborativo
                        FROM avaliacoes
                        GROUP BY id_tmdb, tipo
                    )
                    SELECT 
                        m.id_tmdb, m.tipo, m.titulo, m.sinopse, m.generos, m.url_capa,
                        ROUND(
                            (
                                COALESCE(bs.score_semantico, 0) * %s + 
                                COALESCE(bt.raw_textual / NULLIF((SELECT max_rank FROM max_textual), 0), 0) * %s + 
                                COALESCE(pc.score_colaborativo, 0.6) * %s
                            )::numeric, 4
                        )::float AS score_final
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

            # CENÁRIO B: Feed sem Busca
            else:
                if usuario_id:
                    query_feed = """
                        SELECT 
                            m.id_tmdb, m.tipo, m.titulo, m.sinopse, m.generos, m.url_capa,
                            ROUND((COALESCE(AVG(a.nota), 3.0) / 5.0)::numeric, 4)::float AS score_final
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
                    query_feed = """
                        SELECT 
                            m.id_tmdb, m.tipo, m.titulo, m.sinopse, m.generos, m.url_capa,
                            ROUND((COALESCE(AVG(a.nota), 3.0) / 5.0)::numeric, 4)::float AS score_final
                        FROM midias m
                        LEFT JOIN avaliacoes a ON m.id_tmdb = a.id_tmdb AND m.tipo = a.tipo
                        GROUP BY m.id_tmdb, m.tipo, m.titulo, m.sinopse, m.generos, m.url_capa
                        ORDER BY score_final DESC
                        LIMIT %s;
                    """
                    cur.execute(query_feed, (limit,))

            resultados = cur.fetchall()
            return resultados