import os
import time
import requests
import psycopg2
from tqdm import tqdm
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from deep_translator import GoogleTranslator

load_dotenv()


class EmbeddingProcessor:
    def __init__(self, db_connection):
        self.api_key = os.getenv("API_KEY")
        self.base_url = "https://api.themoviedb.org/3"
        self.conn = db_connection
        self.cur = db_connection.cursor()

        # Carrega o modelo uma única vez na memória
        print("Carregando modelo BERT (SentenceTransformer)...")
        self.model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

        # Controle de taxa para a rota de keywords do TMDB
        self.min_interval = 60.0 / 60.0
        self.last_request_time = 0.0
        self.translator = GoogleTranslator(source="en", target="pt")
        self.keywords_cache = {}

    def _control_rate(self):
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_request_time = time.time()

    def _traduzir_keyword(self, palavra):
        if not palavra:
            return ""
        palavra_limpa = palavra.lower().strip()
        if palavra_limpa in self.keywords_cache:
            return self.keywords_cache[palavra_limpa]
        try:
            # Correção do typo: 'traslate' -> 'translate'
            traducao = self.translator.translate(palavra_limpa)
            self.keywords_cache[palavra_limpa] = traducao
            return traducao
        except Exception:
            return palavra_limpa

    def get_media_keywords(self, id_tmdb, tipo_midia):
        """Busca as palavras-chave da mídia no TMDB e traduz para Português."""
        self._control_rate()
        endpoint = "keywords"
        url = f"{self.base_url}/{tipo_midia}/{id_tmdb}/{endpoint}"
        params = {"api_key": self.api_key}

        try:
            response = requests.get(url, params=params)
            if response.status_code == 200:
                dados = response.json()
                key_field = "keywords" if tipo_midia == "movie" else "results"
                lista_chaves = dados.get(key_field, [])

             
                keywords_en = [
                    k.get("name") for k in lista_chaves[:10] if k.get("name")
                ]
                keywords_pt = [self._traduzir_keyword(kw) for kw in keywords_en]
                return ", ".join(keywords_pt)
            return ""
        except Exception:
            return ""

    def processar_fila(self, reprocessar_tudo=False):
        """
        Busca as mídias, gera o embedding composto e atualiza tanto o vetor 
        quanto o índice FTS (Full-Text Search) no PostgreSQL.
        """
        if reprocessar_tudo:
            # Busca todas as mídias para recalcular embedding e FTS
            query_busca = "SELECT id_tmdb, tipo, titulo, sinopse, generos FROM midias;"
            print("\n[MODO ATUALIZAÇÃO] Buscando TODAS as mídias para unificar os embeddings e FTS...")
        else:
            # Busca mídias que estão sem embedding OU sem fts_vector
            query_busca = """
                SELECT id_tmdb, tipo, titulo, sinopse, generos 
                FROM midias 
                WHERE embedding IS NULL OR fts_vector IS NULL;
            """
            print("\n[MODO FLUXO] Buscando mídias pendentes de vetorização ou FTS...")

        self.cur.execute(query_busca)
        filas = self.cur.fetchall()

        if not filas:
            print("Nenhuma mídia encontrada para processar.")
            return

        print(f"Total de mídias a processar: {len(filas)}")

        with tqdm(filas, desc="Processando IA & FTS", unit="midia") as barra:
            for registro in barra:
                id_tmdb, tipo, titulo, sinopse, generos = registro

                # 1. Busca e traduz as palavras-chave na API do TMDB
                keywords = self.get_media_keywords(id_tmdb, tipo)

                # 2. Monta o Texto Composto (Early Feature Fusion)
                texto_composto = f"Conteúdo: {titulo}. Gêneros: {generos or ''}. Palavras-chave: {keywords}. Sinopse: {sinopse or ''}"

                # 3. Gera o vetor denso através do BERT
                embedding_vetor = self.model.encode(texto_composto).tolist()

                # 4. Atualiza o texto_busca, embedding E o fts_vector (FTS em Português)
                query_update = """
                    UPDATE midias 
                    SET texto_busca = %s, 
                        embedding = %s::vector,
                        fts_vector = to_tsvector('portuguese', %s)
                    WHERE id_tmdb = %s AND tipo = %s;
                """
                try:
                    self.cur.execute(
                        query_update,
                        (texto_composto, embedding_vetor, texto_composto, id_tmdb, tipo)
                    )
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
            host=os.getenv("DB_HOST_IP"),
            port=os.getenv("DB_PORT"),
        )
    except Exception as e:
        print(f"Erro de conexão com o banco: {e}")
        exit()

    processor = EmbeddingProcessor(conn)

    print("\n--- Gerenciador de Vetores e FTS KPlus ---")
    print("1 - Processar pendentes (Fila normal: novos sem embedding ou FTS)")
    print("2 - Reprocessar TUDO (Regerar vetores, palavras-chave e FTS do zero)")
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