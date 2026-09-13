import os
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

@contextmanager
def get_db_connection():
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor)
    else:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME", "sistema_de_recomendacao"),
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASSWORD", ""),
            host=os.getenv("DB_HOST", "localhost"),
            port=os.getenv("DB_PORT", "5432"),
            cursor_factory=RealDictCursor # Retorna as linhas como dicionários do Python
        )
    try:
        yield conn
    finally:
        conn.close()