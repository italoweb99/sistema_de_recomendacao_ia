import time
import requests
from tqdm import tqdm
import psycopg2

class TMDBDataCollector:
    def __init__(self, api_key, db_connection):
        self.api_key = api_key
        self.base_url = "https://api.themoviedb.org/3"
        self.conn = db_connection
        self.cur = db_connection.cursor()
        
        # 40 requisições por minuto = 1 requisição a cada 1.5 segundos
        self.min_interval = 60.0 / 40.0 
        self.last_request_time = 0.0
        
        self.insert_query = "INSERT INTO Midias (id_movie, titulo, sinopse) VALUES (%s, %s, %s);"

    def _control_rate(self):
        """Garante que o intervalo mínimo entre as requisições seja respeitado."""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_interval:
            sleep_time = self.min_interval - elapsed
            time.sleep(sleep_time)
        self.last_request_time = time.time()

    def get_movie_details(self, movie_id):
        """Busca os parâmetros necessários (título e sinopse) de um filme pelo ID."""
        self._control_rate()
        
        url = f"{self.base_url}/movie/{movie_id}"
        params = {
            "api_key": self.api_key,
            "language": "pt-BR"
        }
        
        try:
            response = requests.get(url, params=params)
            
            if response.status_code == 429:
                return {"status": "STOP_429"}
                
            if response.status_code == 200:
                dados = response.json()
                return {
                    "status": "SUCCESS",
                    "titulo": dados.get("title"),
                    "sinopse": dados.get("overview")
                }
            elif response.status_code == 404:
                return {"status": "NOT_FOUND"}
            else:
                return {"status": "ERROR", "code": response.status_code}
                
        except requests.exceptions.RequestException:
            return {"status": "CONNECTION_FAILED"}

    def save_to_db(self, movie_id, titulo, sinopse):
        """Método encapsulado para salvar dados com tratamento de transação seguro."""
        try:
            self.cur.execute(self.insert_query, (movie_id, titulo, sinopse))
            self.conn.commit()
            return True
        except Exception as error:
            self.conn.rollback()
            tqdm.write(f" -> Erro ao salvar ID {movie_id} no Banco: {error}")
            return False

    def close_cursor(self):
        """Fecha o cursor interno quando a coleta terminar."""
        self.cur.close()


# --- EXECUÇÃO PRINCIPAL COM ENTRADA DO USUÁRIO ---
if __name__ == "__main__":
    API_KEY = "SUA_CHAVE_API_AQUI"
    
    # 1. Gerenciamento seguro da conexão externa ao loop
    try:
        conn = psycopg2.connect(
            dbname="your_db", 
            user="your_user", 
            password="your_password", 
            host="localhost", 
            port="5432"
        )
    except Exception as db_error:
        print(f"Falha crítica na conexão com o PostgreSQL: {db_error}")
        exit()

    collector = TMDBDataCollector(API_KEY, conn)
    
    print("=== Configuração do Coletor de Dados TMDB ===")
    try:
        id_inicial = int(input("Digite o ID inicial do filme: "))
        id_final = int(input("Digite o ID final do filme: "))
        
        if id_inicial > id_final:
            print("Erro: O ID inicial não pode ser maior que o ID final.")
            conn.close()
            exit()
    except ValueError:
        print("Por favor, insira apenas números inteiros válidos para os IDs.")
        conn.close()
        exit()

    lista_ids = range(id_inicial, id_final + 1)
    catálogo_tcc = []
    
    print(f"\nIniciando varredura de {len(lista_ids)} IDs potenciais...")
    
    with tqdm(lista_ids, desc="Progresso da Coleta", unit="filme") as barra_progresso:
        for movie_id in barra_progresso:
            
            resultado = collector.get_movie_details(movie_id)
            
            if resultado["status"] == "STOP_429":
                tqdm.write(f"\n[ALERTA] Código 429 recebido no ID {movie_id}. Interrompendo processo.")
                break
                
            elif resultado["status"] == "SUCCESS":
                if resultado["sinopse"]: # Filtro essencial para o BERT
                    
                    # Salva no PostgreSQL de forma isolada
                    saved = collector.save_to_db(movie_id, resultado["titulo"], resultado["sinopse"])
                    
                    if saved:
                        catálogo_tcc.append({
                            "id": movie_id,
                            "titulo": resultado["titulo"],
                            "sinopse": resultado["sinopse"]
                        })
                        barra_progresso.set_postfix(ultimo_filme=resultado["titulo"][:15])
            
            elif resultado["status"] == "ERROR":
                tqdm.write(f" -> ID {movie_id} retornou status HTTP {resultado.get('code')}.")

    # 2. Fechamento limpo de recursos após o término do loop completo
    collector.close_cursor()
    conn.close()

    print("\n=== Coleta Finalizada ===")
    print(f"Total de filmes com sinopses válidas armazenados no banco: {len(catálogo_tcc)}")