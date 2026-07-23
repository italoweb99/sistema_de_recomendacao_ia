import time
import requests
from tqdm import tqdm
import psycopg2
import os
from dotenv import load_dotenv
from deep_translator import GoogleTranslator
load_dotenv()

class TMDBDataCollector:
    def __init__(self, db_connection, tipo_midia):
        self.api_key = os.getenv("API_KEY")
        self.base_url = "https://api.themoviedb.org/3"
        self.conn = db_connection
        self.cur = db_connection.cursor()
        self.tipo_midia = tipo_midia 
        self.min_interval = 60.0 / 60.0
        self.last_request_time = 0.0
        self.genero_cache = {}
        self.translator = GoogleTranslator(source='en', target='pt')
        # URL base de imagens do TMDB (w500 significa 500px de largura, ideal para mobile)
        self.base_image_url = "https://image.tmdb.org/t/p/w500"

    def _control_rate(self):
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_request_time = time.time()

    def get_missing_media_from_db(self):
        """Busca mídias já coletadas que ainda não possuem gênero ou capa preenchidos."""
        query = """
            SELECT id_tmdb FROM Midias 
            WHERE tipo = %s AND (generos IS NULL OR url_capa IS NULL)
            ORDER BY id_tmdb ASC;
        """
        self.cur.execute(query, (self.tipo_midia,))
        return [row[0] for row in self.cur.fetchall()]

    def get_media_details(self, media_id):
        self._control_rate()
        url = f"{self.base_url}/{self.tipo_midia}/{media_id}"
        params = {"api_key": self.api_key, "language": "pt-BR"}
        
        try:
            response = requests.get(url, params=params)
            if response.status_code == 429:
                return {"status": "STOP_429"}
                
            if response.status_code == 200:
                dados = response.json()
                titulo = dados.get("title") if self.tipo_midia == "movie" else dados.get("name")
                
                # 1. Extrai os nomes dos gêneros e junta em uma string separada por vírgulas
                lista_generos = [g.get("name") for g in dados.get("genres", [])]
                generos_str = ", ".join(lista_generos) if lista_generos else None
                
                # 2. Monta a URL completa da imagem do poster
                poster_path = dados.get("poster_path")
                url_capa = f"{self.base_image_url}{poster_path}" if poster_path else None
                
                return {
                    "status": "SUCCESS",
                    "titulo": titulo,
                    "sinopse": dados.get("overview"),
                    "generos": generos_str,
                    "url_capa": url_capa
                }
            return {"status": "NOT_FOUND"}
        except requests.exceptions.RequestException:
            return {"status": "CONNECTION_FAILED"}

    def update_media_in_db(self, media_id, generos, url_capa):
        """Atualiza os novos atributos nos registros que já existiam."""
        query = """
            UPDATE Midias 
            SET generos = %s, url_capa = %s 
            WHERE id_tmdb = %s AND tipo = %s;
        """
        try:
            self.cur.execute(query, (generos, url_capa, media_id, self.tipo_midia))
            self.conn.commit()
            return True
        except Exception as error:
            self.conn.rollback()
            tqdm.write(f" -> Erro ao atualizar ID {media_id}: {error}")
            return False
        
    def traduz_genero(self, generos):
        if generos:
            retorno = []
            #Divide os generos em palavras separadas
            generos_separados = generos.split(",")
            #Traduz cada palavra separadamente e depois as junta em um array
            for palavra in generos_separados:
                palavra_limpa = palavra.lower().strip()
                if palavra_limpa in self.genero_cache:
                    retorno.append(self.genero_cache[palavra_limpa])
                try:
                    traducao=self.translator.translate(palavra_limpa)
                    self.genero_cache[palavra_limpa] = traducao
                    retorno.append(traducao)
                    
                except Exception as erro:
                    print(f"]Não foi possivel traduzir a palavra:{erro}")
                    retorno.append(palavra_limpa)
            return",".join(retorno)


if __name__ == "__main__":
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"), user=os.getenv("DB_USER"), 
            password=os.getenv("DB_PASSWORD"), host=os.getenv("DB_HOST"), port=os.getenv("DB_PORT")
        )
    except Exception as db_error:
        print(f"Falha na conexão: {db_error}"); exit()
    atualizacao_tipo = int(input("digite 1 para traduzir generos de serie e 2 para obter capas e generos de filmes ou series "))
    if atualizacao_tipo == 1:
        collector = TMDBDataCollector(conn, 'tv')
        query = "SELECT id_tmdb,generos FROM midias WHERE tipo = 'tv';"
        with conn.cursor() as cur:
            cur.execute(query)
            dados = cur.fetchall()
            ids_series = [row[0] for row in dados]
            with tqdm (dados, desc="Atualizando Generos", unit="serie")as barra:
                for midia_id,genero in barra:
                    traducao = collector.traduz_genero(genero)
                    try:
                        query = "UPDATE midias SET generos = %s WHERE id_tmdb = %s AND tipo = 'tv'"
                        collector.cur.execute(query,(traducao,midia_id))
                        collector.conn.commit()
                    except Exception as error:
                        collector.conn.rollback()
                        tqdm.write(f" -> Erro ao atualizar ID {midia_id}: {error}")


       
    else:
        tipo_escolhido = input("Tipo de mídia para atualizar ('movie' or 'tv'): ").strip().lower()
        collector = TMDBDataCollector(conn, tipo_escolhido)
        
        # Mapeia os IDs incompletos que já estão guardados no banco
        ids_incompletos = collector.get_missing_media_from_db()
        print(f"\nForam encontrados {len(ids_incompletos)} registros para enriquecer de dados.")

        if ids_incompletos:
            with tqdm(ids_incompletos, desc="Enriquecendo Banco", unit="midia") as barra:
                for media_id in barra:
                    res = collector.get_media_details(media_id)
                    
                    if res["status"] == "STOP_429":
                        break
                    elif res["status"] == "SUCCESS":
                        collector.update_media_in_db(media_id, res["generos"], res["url_capa"])
                        barra.set_postfix(id=media_id)

    collector.cur.close()
    conn.close()
    print("\n=== Atualização de dados concluída! ===")