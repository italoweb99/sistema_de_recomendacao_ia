import time
import psycopg2
from sentence_transformers import SentenceTransformer
from tqdm import tqdm
import os
from dotenv import load_dotenv
load_dotenv()
def processar_embeddings_distribuido(meta_registros, intervalo_espera=5):
    # 1. Inicializa o modelo BERT na Máquina B
    print("Carregando modelo BERT (all-MiniLM-L6-v2) na Máquina B...")
    model = SentenceTransformer('all-MiniLM-L6-v2')
    
    # 2. Conecta ao banco de dados (coloque o IP da máquina onde o Postgres está instalado)
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"), 
            user=os.getenv("DB_USER"), 
            password=os.getenv("DB_PASSWORD"), 
            host=os.getenv("DB_HOST_IP"), # Ex: 192.168.1.50
            port=os.getenv("DB_PORT")
        )
        cur = conn.cursor()
    except Exception as e:
        print(f"Erro ao conectar ao banco: {e}")
        return

    registros_processados = 0
    print(f"\nIniciando o consumidor. Meta: {meta_registros} embeddings.")

    # Cria uma barra de progresso manual baseada na meta
    with tqdm(total=meta_registros, desc="Embeddings Gerados", unit="emb") as pbar:
        while registros_processados < meta_registros:
            
            # Busca o próximo filme que a Máquina A já baixou, mas que ainda não tem embedding
            cur.execute("""
                SELECT id, sinopse FROM Midias 
                WHERE embedding IS NULL 
                ORDER BY id ASC 
                LIMIT 1;
            """)
            registro = cur.fetchone()

            if registro:
                movie_id, sinopse = registro
                
                try:
                    # Gera o embedding usando a GPU/CPU da Máquina B
                    embedding = model.encode(sinopse).tolist()
                    
                    # Atualiza o registro no banco adicionando o vetor correspondente
                    cur.execute("""
                        UPDATE Midias 
                        SET embedding = %s 
                        WHERE id = %s;
                    """, (embedding, movie_id))
                    conn.commit()
                    
                    registros_processados += 1
                    pbar.update(1)
                    
                except Exception as err:
                    conn.rollback()
                    tqdm.write(f"Erro ao processar ID {movie_id}: {err}")
            else:
                # Se o banco não retornou nada, significa que a Máquina B foi mais rápida 
                # que a Máquina A. Ela aguarda o tempo estipulado para o banco ser populado.
                tqdm.write(f" -> Aguardando a Máquina A popular o banco... (pausa de {intervalo_espera}s)")
                time.sleep(intervalo_espera)

    # Fecha os recursos de forma limpa
    cur.close()
    conn.close()
    print(f"\n=== Meta de {meta_registros} registros atingida com sucesso! ===")

if __name__ == "__main__":
    # Define quantos registros você quer que a Máquina B processe antes de parar
    META_TOTAL = 500 
    processar_embeddings_distribuido(meta_registros=META_TOTAL, intervalo_espera=10)