"""
Script de Migracao Direta do Banco Local para o Supabase (ou Neon/Railway).
Transfere tabelas, indices e vetores embeddings com barra de progresso.
"""
import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from dotenv import load_dotenv
from tqdm import tqdm

# Forca stdout em UTF-8 no Windows quando suportado
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

load_dotenv()

# Conexao Local
LOCAL_HOST = os.getenv("DB_HOST", "localhost")
LOCAL_PORT = os.getenv("DB_PORT", "5432")
LOCAL_NAME = os.getenv("DB_NAME", "sistema_de_recomendacao")
LOCAL_USER = os.getenv("DB_USER")
LOCAL_PASS = os.getenv("DB_PASSWORD")

def criar_tabelas_supabase(conn_remota):
    """Cria extensoes e tabelas no banco remoto ajustadas exatamente ao schema local."""
    ddl = """
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(150) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        senha_hash VARCHAR(255) NOT NULL,
        data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS midias (
        id_tmdb INT NOT NULL,
        tipo VARCHAR(10) NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        sinopse TEXT,
        generos VARCHAR(255),
        url_capa VARCHAR(500),
        texto_busca TEXT,
        embedding vector(384),
        fts_vector tsvector GENERATED ALWAYS AS (
            to_tsvector('portuguese', coalesce(titulo, '') || ' ' || coalesce(sinopse, ''))
        ) STORED,
        PRIMARY KEY (id_tmdb, tipo)
    );

    CREATE TABLE IF NOT EXISTS avaliacoes (
        id SERIAL PRIMARY KEY,
        usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
        id_tmdb INT NOT NULL,
        tipo VARCHAR(10) NOT NULL,
        nota NUMERIC(2, 1) CHECK (nota >= 1.0 AND nota <= 5.0),
        criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        UNIQUE (usuario_id, id_tmdb, tipo)
    );

    CREATE INDEX IF NOT EXISTS idx_midias_fts ON midias USING gin(fts_vector);

    -- Garante que colunas adicionais existam mesmo se a tabela ja foi criada anteriormente
    ALTER TABLE IF EXISTS usuarios ADD COLUMN IF NOT EXISTS data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    ALTER TABLE IF EXISTS midias ADD COLUMN IF NOT EXISTS texto_busca TEXT;
    """
    with conn_remota.cursor() as cur:
        cur.execute(ddl)
    conn_remota.commit()
    print("[OK] Estrutura de tabelas e extensao 'vector' prontas no Supabase.")

def migrar_tabela_usuarios(conn_local, conn_remota):
    print("\n[MIGRANDO] Tabela 'usuarios'...")
    with conn_local.cursor() as cur_loc:
        cur_loc.execute("SELECT id, nome, email, senha_hash, data_criacao FROM usuarios ORDER BY id;")
        rows = cur_loc.fetchall()

    if not rows:
        print("[INFO] Nenhum usuario local para migrar.")
        return

    insert_query = """
        INSERT INTO usuarios (id, nome, email, senha_hash, data_criacao)
        VALUES %s
        ON CONFLICT (id) DO UPDATE 
        SET nome = EXCLUDED.nome,
            email = EXCLUDED.email,
            senha_hash = EXCLUDED.senha_hash,
            data_criacao = EXCLUDED.data_criacao;
    """
    valores = [(r["id"], r["nome"], r["email"], r["senha_hash"], r.get("data_criacao")) for r in rows]
    with conn_remota.cursor() as cur_rem:
        execute_values(cur_rem, insert_query, valores)
        cur_rem.execute("SELECT setval('usuarios_id_seq', (SELECT COALESCE(MAX(id), 1) FROM usuarios));")
    conn_remota.commit()
    print(f"[OK] {len(rows)} usuarios migrados com sucesso!")

def migrar_tabela_midias(conn_local, conn_remota, batch_size=200):
    print("\n[MIGRANDO] Tabela 'midias' (incluindo embeddings)...")
    with conn_local.cursor() as cur_loc:
        cur_loc.execute("SELECT COUNT(*) as total FROM midias;")
        total = cur_loc.fetchone()["total"]

        if total == 0:
            print("[INFO] Nenhuma midia local para migrar.")
            return

        cur_loc.execute("SELECT id_tmdb, tipo, titulo, sinopse, generos, url_capa, texto_busca, embedding FROM midias ORDER BY id_tmdb;")

        insert_query = """
            INSERT INTO midias (id_tmdb, tipo, titulo, sinopse, generos, url_capa, texto_busca, embedding)
            VALUES %s
            ON CONFLICT (id_tmdb, tipo) DO UPDATE
            SET titulo = EXCLUDED.titulo,
                sinopse = EXCLUDED.sinopse,
                generos = EXCLUDED.generos,
                url_capa = EXCLUDED.url_capa,
                texto_busca = EXCLUDED.texto_busca,
                embedding = EXCLUDED.embedding;
        """

        with tqdm(total=total, desc="Enviando midias", ascii=True) as pbar:
            while True:
                lote = cur_loc.fetchmany(batch_size)
                if not lote:
                    break

                valores = [
                    (
                        r["id_tmdb"],
                        r["tipo"],
                        r["titulo"],
                        r["sinopse"],
                        r["generos"],
                        r["url_capa"],
                        r.get("texto_busca"),
                        r["embedding"],
                    )
                    for r in lote
                ]

                with conn_remota.cursor() as cur_rem:
                    execute_values(cur_rem, insert_query, valores)
                conn_remota.commit()
                pbar.update(len(lote))

    print(f"[OK] Todas as {total} midias e seus vetores foram migradas com sucesso!")

def migrar_tabela_avaliacoes(conn_local, conn_remota):
    print("\n[MIGRANDO] Tabela 'avaliacoes'...")
    with conn_local.cursor() as cur_loc:
        cur_loc.execute("SELECT id, usuario_id, id_tmdb, tipo, nota, criado_em FROM avaliacoes ORDER BY id;")
        rows = cur_loc.fetchall()

    if not rows:
        print("[INFO] Nenhuma avaliacao local para migrar.")
        return

    insert_query = """
        INSERT INTO avaliacoes (id, usuario_id, id_tmdb, tipo, nota, criado_em)
        VALUES %s
        ON CONFLICT (usuario_id, id_tmdb, tipo) DO UPDATE
        SET nota = EXCLUDED.nota, criado_em = EXCLUDED.criado_em;
    """
    valores = [(r["id"], r["usuario_id"], r["id_tmdb"], r["tipo"], r["nota"], r["criado_em"]) for r in rows]
    with conn_remota.cursor() as cur_rem:
        execute_values(cur_rem, insert_query, valores)
        cur_rem.execute("SELECT setval('avaliacoes_id_seq', (SELECT COALESCE(MAX(id), 1) FROM avaliacoes));")
    conn_remota.commit()
    print(f"[OK] {len(rows)} avaliacoes migradas com sucesso!")

def main():
    print("=" * 60)
    print(">> Assistente de Migracao do Banco de Dados para a Nuvem <<")
    print("=" * 60)

    # 1. Pede a URL do Supabase ou le do ambiente
    supabase_url = os.getenv("SUPABASE_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not supabase_url or "localhost" in supabase_url:
        print("\nCole a sua String de Conexao (DATABASE_URL) do Supabase:")
        print("(Exemplo: postgresql://postgres:senha@db.xxxx.supabase.co:5432/postgres)")
        supabase_url = input("\nDATABASE_URL: ").strip()

    if not supabase_url:
        print("[ERRO] Operacao cancelada. A URL do banco e necessaria.")
        return

    # 2. Conecta ao banco local
    print(f"\n[CONECTANDO] PostgreSQL local ({LOCAL_HOST}:{LOCAL_PORT}/{LOCAL_NAME})...")
    try:
        conn_local = psycopg2.connect(
            dbname=LOCAL_NAME,
            user=LOCAL_USER,
            password=LOCAL_PASS,
            host=LOCAL_HOST,
            port=LOCAL_PORT,
            cursor_factory=RealDictCursor
        )
        print("[OK] Conectado ao banco local!")
    except Exception as e:
        print(f"[ERRO] Falha ao conectar ao banco local: {e}")
        return

    # 3. Conecta ao banco remoto (Supabase)
    print("[CONECTANDO] Supabase na nuvem...")
    try:
        conn_remota = psycopg2.connect(supabase_url)
        print("[OK] Conectado ao Supabase com sucesso!")
    except Exception as e:
        print(f"[ERRO] Falha ao conectar ao Supabase: {e}")
        conn_local.close()
        return

    try:
        criar_tabelas_supabase(conn_remota)
        migrar_tabela_usuarios(conn_local, conn_remota)
        migrar_tabela_midias(conn_local, conn_remota)
        migrar_tabela_avaliacoes(conn_local, conn_remota)
        print("\n" + "=" * 60)
        print("[SUCESSO] MIGRACAO CONCLUIDA! O Supabase esta pronto para uso!")
        print("=" * 60)
    finally:
        conn_local.close()
        conn_remota.close()

if __name__ == "__main__":
    main()
