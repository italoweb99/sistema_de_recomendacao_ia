import time
import requests
from tqdm import tqdm
import psycopg2
import os
from dotenv import load_dotenv

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

if __name__ == "__main__":
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"), user=os.getenv("DB_USER"), 
            password=os.getenv("DB_PASSWORD"), host=os.getenv("DB_HOST"), port=os.getenv("DB_PORT")
        )
    except Exception as db_error:
        print(f"Falha na conexão: {db_error}"); exit()

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