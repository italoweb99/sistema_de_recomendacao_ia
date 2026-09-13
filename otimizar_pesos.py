import itertools
import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor
from sentence_transformers import SentenceTransformer


import json

def carregar_casos_de_teste(caminho_arquivo="casos_de_teste.json"):
    with open(caminho_arquivo, "r", encoding="utf-8") as f:
        return json.load(f)

# Uso no script de otimização
CASOS_DE_TESTE = carregar_casos_de_teste()
print(f"Total de testes carregados: {len(CASOS_DE_TESTE)}")

for caso in CASOS_DE_TESTE:
    usuario = caso["usuario_id"]
    query = caso["query"]
    esperados = caso["midias_esperadas"]
    


# Modelo para codificar a busca durante o teste
model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")


def get_db_connection():
    return psycopg2.connect(

        dbname="sistema_de_recomendacao",
        user="postgres",
        password="Itajujmv1",
        host="localhost",
        port="5432",
        cursor_factory=RealDictCursor
    )


def calcular_ndcg_at_k(recomendados_ids, esperados_ids, k=10):
    """Calcula a precisão do ranqueamento (NDCG@K)."""
    recomendados_k = recomendados_ids[:k]
    dcg = 0.0
    for i, item_id in enumerate(recomendados_k):
        if item_id in esperados_ids:
            dcg += 1.0 / np.log2(i + 2) # i+2 pois o índice começa em 0
            
    idcg = sum(1.0 / np.log2(i + 2) for i in range(min(len(esperados_ids), k)))
    return dcg / idcg if idcg > 0 else 0.0


def buscar_com_pesos(conn, usr_query, usuario_id, w_sem, w_text, w_colab, limit=10):
    """Executa a busca híbrida no banco utilizando a SQL normalizada."""
    embedded_query = model.encode(usr_query).tolist()
    w_sem = float(w_sem)
    w_text = float(w_text)
    w_colab = float(w_colab)
    limit = int(limit)
    
    # SQL normalizado (conforme passo 1)
    sql = """
        WITH busca_semantica AS (
            SELECT id_tmdb, tipo, (1 - (embedding <=> %s::vector)) AS score_semantico
            FROM midias WHERE embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector LIMIT 50
        ),
        busca_textual AS (
            SELECT id_tmdb, tipo, ts_rank(fts_vector, plainto_tsquery('portuguese', %s)) AS raw_textual
            FROM midias WHERE fts_vector @@ plainto_tsquery('portuguese', %s) LIMIT 50
        ),
        max_textual AS (
            SELECT COALESCE(MAX(raw_textual), 1.0) AS max_rank FROM busca_textual
        ),
        predicao_colaborativa AS (
            SELECT id_tmdb, tipo, (COALESCE(AVG(nota), 3.0) / 5.0) AS score_colaborativo
            FROM avaliacoes GROUP BY id_tmdb, tipo
        )
        SELECT 
            m.id_tmdb,
            (
                COALESCE(bs.score_semantico, 0) * %s + 
                COALESCE(bt.raw_textual / (SELECT max_rank FROM max_textual), 0) * %s + 
                COALESCE(pc.score_colaborativo, 0.3) * %s
            ) AS score_final
        FROM midias m
        LEFT JOIN busca_semantica bs ON m.id_tmdb = bs.id_tmdb AND m.tipo = bs.tipo
        LEFT JOIN busca_textual bt ON m.id_tmdb = bt.id_tmdb AND m.tipo = bt.tipo
        LEFT JOIN predicao_colaborativa pc ON m.id_tmdb = pc.id_tmdb AND m.tipo = pc.tipo
        WHERE bs.id_tmdb IS NOT NULL OR bt.id_tmdb IS NOT NULL
        ORDER BY score_final DESC LIMIT %s;
    """
    
    with conn.cursor() as cur:
        cur.execute(sql, (
            embedded_query, embedded_query,
            usr_query, usr_query,
            float(w_sem),float(w_text),float(w_colab),
            int(limit)
        ))
        res = cur.fetchall()
        return [r["id_tmdb"] for r in res]


def otimizar():
    conn = get_db_connection()
    
    # Gera combinações de pesos que somam 1.0 (passo de 0.1 em 0.1)
    passo = 0.1
    valores = np.round(np.arange(0.0, 1.1, passo), 2)
    
    melhor_score = -1.0
    melhor_config = None

    print("Iniciando varredura de combinações de pesos...\n")

    for w_sem, w_text, w_colab in itertools.product(valores, repeat=3):
        w_sem = float(w_sem)
        w_text = float(w_text)
        w_colab = float(w_colab)
        # Apenas combinações cuja soma seja exatamente 1.0
        if not np.isclose(w_sem + w_text + w_colab, 1.0):
            continue

        scores_casos = []
        for caso in CASOS_DE_TESTE:
            ids_esperados = [midia["id"] for midia in caso.get("midias_esperadas", [])]
            ids_retornados = buscar_com_pesos(
                conn, 
                caso["query"], 
                caso["usuario_id"], 
                w_sem, w_text, w_colab
            )
            score_ndcg = calcular_ndcg_at_k(ids_retornados, ids_esperados, k=10)
            scores_casos.append(score_ndcg)

        ndcg_medio = np.mean(scores_casos)

        if ndcg_medio > melhor_score:
            melhor_score = ndcg_medio
            melhor_config = (w_sem, w_text, w_colab)
            print(f" Novo Melhor NDCG: {melhor_score:.4f} | Pesos: Sem={w_sem}, Text={w_text}, Colab={w_colab}")

    conn.close()

    print("\n" + "="*50)
    print("      CONFIGURAÇÃO DE PESOS OPTIMAL ENCONTRADA      ")
    print("="*50)
    print(f"Pontuação NDCG@10 : {melhor_score:.4f}")
    print(f"Peso Semântico    : {melhor_config[0]}")
    print(f"Peso Textual (FTS): {melhor_config[1]}")
    print(f"Peso Colaborativo : {melhor_config[2]}")
    print("="*50)

if __name__ == "__main__":
    otimizar()