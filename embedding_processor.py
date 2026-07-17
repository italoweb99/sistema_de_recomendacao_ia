import os
import time
import requests
import psycopg2
from tqdm import tqdm
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

load_dotenv()

class EmbeddingProcessor:
    def __init__(self, db_connection):
        self.api_key = os.getenv("API_KEY")
        self.base_url = "https://api.themoviedb.org/3"
        self.conn = db_connection
        self.cur = db_connection.cursor()
        
        # Carrega o modelo uma única vez na memória
        print("Carregando modelo BERT (SentenceTransformer)...")
        self.model = SentenceTransformer("all-MiniLM-L6-v2")
        
        # Controle de taxa para a rota de keywords do TMDB
        self.min_interval = 60.0 / 40.0
        self.last_request_time = 0.0

    def _control_rate(self):
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_request_time = time.time()

    def get_media_keywords(self, id_tmdb, tipo_midia):
        """Busca as palavras-chave da mídia no TMDB."""
        self._control_rate()
        endpoint = "keywords" if tipo_midia == "movie" else "aggregate_keywords"
        url = f"{self.base_url}/{tipo_midia}/{id_tmdb}/{endpoint}"
        params = {"api_key": self.api_key}
        
        try:
            response = requests.get(url, params=params)
            if response.status_code == 200:
                dados = response.json()
                key_field = "keywords" if tipo_midia == "movie" else "results"
                lista_chaves = dados.get(key_field, [])
                # Pega as 10 principais palavras-chave
                return ", ".join([k.get("name") for k in lista_chaves[:10]])
            return ""
        except Exception:
            return ""

    def processar_fila(self, reprocessar_tudo=False):
        """
        Busca as mídias e gera o embedding composto.
        Se reprocessar_tudo=True, ele ignora se o embedding já existe e regera tudo.
        """
        if reprocessar_tudo:
            # Busca absolutamente tudo para unificar a base antiga
            query_busca = "SELECT id_tmdb, tipo, titulo, sinopse, generos FROM midias;"
            print("\n[MODO ATUALIZAÇÃO] Buscando TODAS as mídias para unificar os embeddings...")
        else:
            # Busca apenas o que o coletor inseriu agora e está sem vetor
            query_busca = "SELECT id_tmdb, tipo, titulo, sinopse, generos FROM midias WHERE embedding IS NULL;"
            print("\n[MODO FLUXO] Buscando apenas mídias novas sem embedding...")

        self.cur.execute(query_busca)
        filas = self.cur.fetchall()

        if not filas:
            print("Nenhuma mídia encontrada para processar.")
            return

        print(f"Total de mídias a processar: {len(filas)}")

        with tqdm(filas, desc="Processando IA (Early Fusion)", unit="midia") as barra:
            for registro in barra:
                id_tmdb, tipo, titulo, sinopse, generos = registro

                # 1. Busca as palavras-chave na API do TMDB
                keywords = self.get_media_keywords(id_tmdb, tipo)

                # 2. Monta o Texto Composto (Early Feature Fusion)
                texto_composto = f"Conteúdo: {titulo}. Gêneros: {generos or ''}. Palavras-chave: {keywords}. Sinopse: {sinopse or ''}"

                # 3. Gera o vetor denso através do BERT
                embedding_vetor = self.model.encode(texto_composto).tolist()

                # 4. Dá o UPDATE salvando o texto bruto de busca e o vetor convertido
                query_update = """
                    UPDATE midias 
                    SET texto_busca = %s, embedding = %s::vector 
                    WHERE id_tmdb = %s AND tipo = %s;
                """
                try:
                    self.cur.execute(query_update, (texto_composto, embedding_vetor, id_tmdb, tipo))
                    self.conn.commit()
                    barra.set_postfix(processado=titulo[:15])
                except Exception as e:
                    self.conn.rollback()
                    tqdm.write(f"Erro ao atualizar ID {id_tmdb}: {e}")


if __name__ == "__main__":
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT")
        )
    except Exception as e:
        print(f"Erro de conexão com o banco: {e}")
        exit()

    processor = EmbeddingProcessor(conn)
    
    print("\n--- Gerenciador de Vetores KPlus ---")
    print("1 - Processar apenas novos registros (Fila normal)")
    print("2 - Reprocessar TUDO (Atualizar registros antigos para o novo padrão)")
    opcao = input("Escolha uma opção: ").strip()

    if opcao == "1":
        processor.processar_fila(reprocessar_tudo=False)
    elif opcao == "2":
        processor.processar_fila(reprocessar_tudo=True)
    else:
        print("Opção inválida.")

    processor.cur.close()
    conn.close()
    print("\nProcessamento concluído com sucesso!")