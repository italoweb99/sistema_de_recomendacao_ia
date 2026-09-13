# 🚀 Guia Completo: Como Colocar o KPlus Online (100% Gratuito)

Este guia orienta o passo a passo para hospedar o **Banco de Dados com IA (pgvector)**, o **Backend FastAPI (PyTorch + SentenceTransformers)** e o **Frontend Vite (React + Tailwind)** na nuvem de forma gratuita e profissional.

---

## 🏛️ Arquitetura de Produção na Nuvem

```
  [ Frontend React/Vite ]  --->  (Vercel / Netlify - CDN Global Grátis)
            │
            ▼ Chamadas REST (JSON / Bearer JWT)
  [ Backend FastAPI + PyTorch ] ---> (Hugging Face Spaces - 16 GB RAM Grátis ou Render)
            │
            ▼ Consultas SQL + Distância Cosseno Vector
  [ PostgreSQL + pgvector ]   ---> (Supabase - Grátis com pgvector nativo)
```

---

## 📦 Passo 1: Banco de Dados na Nuvem com `pgvector` (Supabase)

O motor híbrido utiliza vetores de embeddings de 384 dimensões (`vector`) e Full-Text Search em português (`ts_rank`). O **Supabase** é a melhor opção gratuita pois suporta `pgvector` nativamente.

### 1.1 Criar o Projeto
1. Acesse [supabase.com](https://supabase.com) e crie uma conta (ou faça login com GitHub).
2. Clique em **"New Project"**.
3. Escolha um nome (ex: `kplus-db`), defina uma senha forte para o banco e selecione a região mais próxima (ex: `South America (São Paulo)`).

### 1.2 Habilitar a extensão `vector`
1. No menu lateral esquerdo do Supabase, clique em **SQL Editor**.
2. Cole e execute:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### 1.3 Criar a Estrutura de Tabelas
Execute o script DDL no SQL Editor para criar as tabelas:
```sql
-- Tabela de Usuários
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Mídias com Embeddings e FTS
CREATE TABLE IF NOT EXISTS midias (
    id_tmdb INT NOT NULL,
    tipo VARCHAR(10) NOT NULL, -- 'movie' ou 'tv'
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

-- Tabela de Avaliações
CREATE TABLE IF NOT EXISTS avaliacoes (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    id_tmdb INT NOT NULL,
    tipo VARCHAR(10) NOT NULL,
    nota NUMERIC(2, 1) CHECK (nota >= 1.0 AND nota <= 5.0),
    criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    UNIQUE (usuario_id, id_tmdb, tipo)
);

-- Índices para Alta Performance
CREATE INDEX IF NOT EXISTS idx_midias_embedding ON midias USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_midias_fts ON midias USING gin(fts_vector);
```

### 1.4 Migrar seus Dados Locais para o Supabase

Como a base contém vetores matemáticos pesados (~44 MB de embeddings), criamos um assistente automatizado que transfere tudo diretamente de banco para banco sem você precisar lidar com arquivos grandes:

#### Opção A (Recomendada - 100% Automática via Python):
Basta rodar no terminal:
```powershell
python migrar_para_supabase.py
```
O script solicitará a sua `DATABASE_URL` do Supabase, criará as tabelas e enviará usuários, mídias (com embeddings) e avaliações com barra de progresso em tempo real!

#### Opção B (Via `pg_dump` no Windows):
No Windows, o executável do PostgreSQL fica na pasta do sistema. Para gerar o arquivo SQL:
```powershell
$env:PGPASSWORD="Itajujmv1"
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h localhost -U postgres -d sistema_de_recomendacao -t usuarios -t midias -t avaliacoes --data-only --inserts -f dump_dados.sql
```
Depois, para importar no Supabase:
```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" "SUA_DATABASE_URL_DO_SUPABASE" -f dump_dados.sql
```

### 1.5 Obter a String de Conexão (`DATABASE_URL`)
1. No Supabase, vá em **Project Settings** -> **Database**.
2. Na seção **Connection String**, selecione a aba **URI** (modo `Session` ou `Transaction`).
3. Copie a URI. Ela terá o formato:
   ```
   postgresql://postgres.[PROJECT-REF]:[SUA-SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require
   ```

---

## 🐍 Passo 2: Backend Online (FastAPI + Machine Learning)

> 💡 **Dica de Ouro**: O modelo `paraphrase-multilingual-MiniLM-L12-v2` necessita de aproximadamente 1 GB a 1.5 GB de RAM para carregar os pesos em PyTorch. O plano gratuito do Render limita a 512 MB (podendo sofrer travamentos de memória).  
> **Recomendação**: Use o **Hugging Face Spaces** (oferece **16 GB de RAM e 2 vCPUs 100% gratuitos** com suporte a Docker) ou o **Railway**.

### Opção A: Hugging Face Spaces (Recomendado - 16 GB RAM Grátis)
1. Crie uma conta no [huggingface.co](https://huggingface.co).
2. Clique em sua foto de perfil no topo direito e selecione **"New Space"**.
3. Preencha:
   - **Space name**: `kplus-api`
   - **License**: `mit`
   - **Select the Space SDK**: **Docker** -> **Blank**
   - **Space Hardware**: Free (2 vCPU, 16 GB RAM)
   - **Visibility**: Public
4. Clique em **"Create Space"**.
5. No repositório do Space (você pode conectar via Git ou fazer upload dos arquivos pelo navegador):
   - Suba o arquivo `Dockerfile` (já criado no projeto)
   - Suba o arquivo `requirements.txt`
   - Suba a pasta `Api/` com todo seu conteúdo
6. Vá em **Settings** do Space -> **Variables and secrets**:
   - Adicione o secret `DATABASE_URL` com o valor copiado do Supabase.
   - Adicione o secret `JWT_KEY` com uma chave segura (ex: `super_chave_jwt_kplus_2026`).
   - Adicione o secret `SECRET_KEY` com uma chave segura.
7. O Hugging Face iniciará o build do Dockerfile automaticamente. Quando o status mudar para **Running**, copie a URL pública da sua API (ex: `https://italoweb-kplus-api.hf.space`).
8. Teste no navegador: `https://italoweb-kplus-api.hf.space/docs` abrirá a documentação interativa Swagger!

---

### Opção B: Render.com (Web Service)
1. Acesse [render.com](https://render.com) e conecte sua conta do GitHub.
2. Clique em **"New +"** -> **"Web Service"**.
3. Selecione o repositório `sistema_de_recomendacao_ia`.
4. Configure:
   - **Name**: `kplus-api`
   - **Runtime**: `Docker` (usará o `Dockerfile` existente) ou `Python 3`
   - Se escolher Python:
     - **Build Command**: `pip install -r requirements.txt`
     - **Start Command**: `uvicorn Api.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: Free
5. Na seção **Environment Variables**, adicione:
   - `DATABASE_URL`: String de conexão do Supabase
   - `JWT_KEY`: Chave JWT
   - `SECRET_KEY`: Chave secreta
   - `PYTHON_VERSION`: `3.11.9`
6. Clique em **"Create Web Service"**. Em instantes você terá sua URL pública (ex: `https://kplus-api.onrender.com`).

---

## ⚡ Passo 3: Frontend Online (Vercel)

1. Acesse [vercel.com](https://vercel.com) e faça login com seu GitHub.
2. Clique em **"Add New..."** -> **"Project"**.
3. Importe o repositório `sistema_de_recomendacao_ia`.
4. Na tela de configuração:
   - **Root Directory**: Clique em *Edit* e selecione `kplus-ground-truth`.
   - **Framework Preset**: *Vite* (identificado automaticamente).
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Expanda **Environment Variables** e adicione:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: URL do seu backend online (ex: `https://italoweb-kplus-api.hf.space` ou `https://kplus-api.onrender.com`).
6. Clique em **"Deploy"**!
7. Em menos de 1 minuto, sua aplicação estará online com certificado SSL (HTTPS) gratuito em:
   `https://kplus-ground-truth.vercel.app` (ou o nome que você escolher).

---

## 🧪 Passo 4: Como Qualquer Pessoa Pode Testar

Com tudo publicado, basta compartilhar o link da Vercel:
1. **Acesso Direto**: A pessoa acessa o site e imediatamente vê a página **Testar API (Playground)**.
2. **Status Conectado**: O indicador no topo mostrará `Online (XXms)`.
3. **Busca e Recomendações**:
   - Pode clicar nas sugestões prontas (ex: *"Séries de ficção científica com viagem no tempo"*) ou digitar qualquer consulta.
   - Pode ajustar os pesos do motor híbrido (Semântico, Textual e Colaborativo) para comparar a influência de cada técnica.
4. **Avaliação Interativa**:
   - Clicando em "Criar Usuário de Teste (1 Clique)", o sistema gera uma conta temporária instantânea.
   - Ao clicar nas estrelas de 1 a 5 em qualquer filme, a avaliação é salva no banco na hora (`POST /midias/avaliar`).
5. **Inspetor Técnico da API**:
   - A qualquer momento, avaliadores podem abrir a aba de inspeção técnica para ver o tempo de resposta em milissegundos, status HTTP e o JSON bruto retornado pelo algoritmo.
