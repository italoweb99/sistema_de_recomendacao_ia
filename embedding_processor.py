import time
import psycopg2
from sentence_transformers import SentenceTransformer
from tqdm import tqdm
import os
import torch
import torch_directml  # <- Importação obrigatória para usar GPU AMD no Windows
from dotenv import load_dotenv

load_dotenv()

def processar_embeddings_distribuido(meta_registros, intervalo_espera=5):
   
    
    print("Carregando modelo BERT (all-MiniLM-L6-v2) na Máquina B usando GPU AMD...")
    # Carregamos o modelo e explicitamente jogamos ele para a CPU
    model = SentenceTransformer('all-MiniLM-L6-v2', device='cpu')
    
    # 2. Conecta ao banco de dados
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"), 
            user=os.getenv("DB_USER"), 
            password=os.getenv("DB_PASSWORD"), 
            host=os.getenv("DB_HOST_IP"), 
            port=os.getenv("DB_PORT")
        )
        cur = conn.cursor()
    except Exception as e:
        print(f"Erro ao conectar ao banco: {e}")
        return

    registros_processados = 0
    print(f"\nIniciando o consumidor. Meta: {meta_registros} embeddings.")

    with tqdm(total=meta_registros, desc="Embeddings Gerados", unit="emb") as pbar:
        while registros_processados < meta_registros:
            
            cur.execute("""
                SELECT id_movie, sinopse FROM Midias 
                WHERE embedding IS NULL 
                ORDER BY id_movie ASC 
                LIMIT 1;
            """)
            registro = cur.fetchone()

            if registro:
                movie_id, sinopse = registro
                
                try:
                    # O encode() automaticamente utilizará o DirectML configurado no construtor
                    embedding = model.encode(sinopse).tolist()
                    
                    cur.execute("""
                        UPDATE Midias 
                        SET embedding = %s 
                        WHERE id_movie = %s;
                    """, (embedding, movie_id))
                    conn.commit()
                    
                    registros_processados += 1
                    pbar.update(1)
                    
                except Exception as err:
                    conn.rollback()
                    tqdm.write(f"Erro ao processar ID {movie_id}: {err}")
            else:
                tqdm.write(f" -> Aguardando a Máquina A popular o banco... (pausa de {intervalo_espera}s)")
                time.sleep(intervalo_espera)

    cur.close()
    conn.close()
    print(f"\n=== Meta de {meta_registros} registros atingida com sucesso! ===")

if __name__ == "__main__":
    META_TOTAL = int(input("meta de filmes: "))
    processar_embeddings_distribuido(meta_registros=META_TOTAL, intervalo_espera=10)
