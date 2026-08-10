import time
import requests
from tqdm import tqdm
import psycopg2
import os
from dotenv import load_dotenv
from deep_translator import GoogleTranslator
# Carrega as variáveis de ambiente (.env)
load_dotenv()

class TMDBDataCollector:
    def __init__(self, db_connection, tipo_midia):
        self.api_key = os.getenv("API_KEY")
        self.base_url = "https://api.themoviedb.org/3"
        self.conn = db_connection
        self.cur = db_connection.cursor()
        self.tipo_midia = tipo_midia 
        
        # 40 requisições por minuto = 1 requisição a cada 1.5 segundos
        self.min_interval = 60.0 / 60.0 
        self.last_request_time = 0.0
        
        # URL base de imagens do TMDB (w500 = 500px de largura, ideal para o front)
        self.base_image_url = "https://image.tmdb.org/t/p/w500"
        self.genero_cache = {}
        self.translator = GoogleTranslator(source='en', target='pt')
        # Query de inserção atualizada com as novas colunas (gênero e capa)
        self.insert_query = """
            INSERT INTO Midias (id_tmdb, tipo, titulo, sinopse, generos, url_capa) 
            VALUES (%s, %s, %s, %s, %s, %s);
        """

    def _control_rate(self):
        """Garante o respeito ao limite de requisições por minuto da API."""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_request_time = time.time()

    def media_exists_in_db(self, media_id):
        """Verifica se o par ID + TIPO já existe no banco para evitar duplicidade."""
        query = "SELECT 1 FROM Midias WHERE id_tmdb = %s AND tipo = %s;"
        self.cur.execute(query, (media_id, self.tipo_midia))
        return self.cur.fetchone() is not None

    def get_media_details(self, media_id):
        """Busca os dados textuais, gêneros e caminhos de imagem no TMDB."""
        self._control_rate()
        url = f"{self.base_url}/{self.tipo_midia}/{media_id}"
        params = {"api_key": self.api_key, "language": "pt-BR"}        
        try:
            response = requests.get(url, params=params)
            
            if response.status_code == 429:
                return {"status": "STOP_429"}
                
            if response.status_code == 200:
                dados = response.json()
                
                # Tratamento: Séries usam 'name', Filmes usam 'title'
                titulo = dados.get("title") if self.tipo_midia == "movie" else dados.get("name")
                
                # Mapeamento e extração dos gêneros
                lista_generos = [g.get("name") for g in dados.get("genres", [])]
                #Todo: tradução dos generos
                if self.tipo_midia == "tv":
                    lista_generos = self.traduz_genero(lista_generos)
                generos_str = ", ".join(lista_generos) if lista_generos else None
                
                # Construção da URL da capa
                poster_path = dados.get("poster_path")
                url_capa = f"{self.base_image_url}{poster_path}" if poster_path else None
                
                return {
                    "status": "SUCCESS",
                    "titulo": titulo,
                    "sinopse": dados.get("overview"),
                    "generos": generos_str,
                    "url_capa": url_capa
                }
            elif response.status_code == 404:
                return {"status": "NOT_FOUND"}
            else:
                return {"status": "ERROR", "code": response.status_code}
                
        except requests.exceptions.RequestException:
            return {"status": "CONNECTION_FAILED"}

    def save_to_db(self, media_id, titulo, sinopse, generos, url_capa):
        """Insere o novo registro mantendo o campo embedding como NULL para o outro script processar."""
        try:
            self.cur.execute(self.insert_query, (media_id, self.tipo_midia, titulo, sinopse, generos, url_capa))
            self.conn.commit()
            return True
        except Exception as error:
            self.conn.rollback()
            tqdm.write(f" -> Erro ao salvar ID {media_id}: {error}")
            return False
    def traduz_genero(self,generos):
        retorno = []
        if generos:
            for genero in generos:
                genero_limpo = genero.lower().strip()
                if genero_limpo in self.genero_cache:
                    retorno.append(self.genero_cache[genero_limpo])
                    continue
                try:
                    traducao = self.translator.translate(genero_limpo)
                    self.genero_cache[genero_limpo] = traducao
                    retorno.append(genero_limpo)
                except Exception as error:
                    print (f"Falha ao traduzir genero:{error}")
                    retorno.append(genero_limpo)
            return retorno


                    


# --- EXECUÇÃO PRINCIPAL DO COLETOR ---
if __name__ == "__main__":
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"), 
            user=os.getenv("DB_USER"), 
            password=os.getenv("DB_PASSWORD"), 
            host=os.getenv("DB_HOST"), 
            port=os.getenv("DB_PORT")
        )
    except Exception as db_error:
        print(f"Falha na conexão com o banco: {db_error}")
        exit()

    print("=== Coletor de Dados Normal (TMDB -> Banco) ===")
    tipo_escolhido = input("Escolha o tipo de mídia ('movie' ou 'tv'): ").strip().lower()
    
    if tipo_escolhido not in ['movie', 'tv']:
        print("Tipo inválido. Encerrando.")
        conn.close()
        exit()

    collector = TMDBDataCollector(conn, tipo_escolhido)
    
    try:
        id_inicial = int(input("Digite o ID inicial: "))
        id_final = int(input("Digite o ID final: "))
    except ValueError:
        print("Insira IDs válidos.")
        conn.close()
        exit()

    lista_ids = range(id_inicial, id_final + 1)
    print(f"\nIniciando varredura de {len(lista_ids)} IDs para '{tipo_escolhido}'...")

    with tqdm(lista_ids, desc="Coletando do TMDB", unit="item") as barra:
        for media_id in barra:
            
            # Se já foi coletado antes, pula direto sem gastar requisição web
            if collector.media_exists_in_db(media_id):
                continue
                
            res = collector.get_media_details(media_id)
            
            if res["status"] == "STOP_429":
                tqdm.write(f"\n[ALERTA] Limite 429 atingido no ID {media_id}. Interrompendo.")
                break
                
            elif res["status"] == "SUCCESS":
                # Só salva se tiver sinopse (critério do BERT)
                if res["sinopse"]:
                    saved = collector.save_to_db(
                        media_id, res["titulo"], res["sinopse"], res["generos"], res["url_capa"]
                    )
                    if saved:
                        barra.set_postfix(filme=res["titulo"][:15])
                        
            elif res["status"] == "ERROR":
                tqdm.write(f" -> Erro HTTP {res.get('code')} no ID {media_id}")

    collector.cur.close()
    conn.close()
    print("\n=== Sessão de Coleta Normal Concluída! ===")