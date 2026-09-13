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

> ⚠️ **Nota Importante**: O modelo `paraphrase-multilingual-MiniLM-L12-v2` precisa de ~1–1.5 GB de RAM para carregar em PyTorch.
> O **Hugging Face Spaces** (Docker e Gradio SDKs) e muitas plataformas gratuitas tradicionais passaram a exigir pagamento para suportar esse volume de memória.
> As opções abaixo são as alternativas **realmente gratuitas** e funcionais em 2026.

---

### ⭐ Opção A: Railway.app (Recomendado — $5/mês de crédito grátis)

O Railway oferece **$5 USD de crédito mensal sem cartão de crédito** e suporta Docker nativamente. Para uma API leve como esta, $5 cobre o mês inteiro com folga.

1. Acesse [railway.app](https://railway.app) e faça login com sua conta do **GitHub**.
2. Clique em **"New Project"** → **"Deploy from GitHub repo"**.
3. Selecione o repositório `sistema_de_recomendacao_ia`.
4. O Railway detectará o `Dockerfile` automaticamente. Clique em **"Deploy"**.
5. Após o deploy inicial, vá em **Variables** e adicione:
   - `DATABASE_URL` → sua string de conexão do Supabase
   - `JWT_KEY` → chave JWT segura (ex: `kplus_jwt_super_secreto_2026`)
   - `SECRET_KEY` → chave secreta adicional
   - `PORT` → `8000`
6. Vá em **Settings** → **Networking** → **Generate Domain** para obter sua URL pública (ex: `https://kplus-api-production.up.railway.app`).
7. Teste: acesse `<sua-url>/docs` para ver a documentação Swagger interativa.

> 💡 **Dica**: O Railway para a instância após inatividade (similar ao Render), mas reinicia automaticamente ao receber uma requisição em ~30 segundos.

---

### Opção B: Render.com (Web Service Gratuito — 512 MB RAM)

O Render tem um tier gratuito com 512 MB de RAM. O modelo MiniLM pode funcionar, mas é apertado. Use as otimizações abaixo para garantir o funcionamento:

#### Otimização de memória para o Render

Antes de fazer o deploy no Render, adicione ao topo do `Api/main.py` (logo após os imports):

```python
import os
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["OMP_NUM_THREADS"] = "1"
```

Isso reduz o consumo de RAM em ~30% ao desabilitar paralelismo desnecessário.

#### Passos do deploy no Render:
1. Acesse [render.com](https://render.com) e conecte sua conta do **GitHub**.
2. Clique em **"New +"** → **"Web Service"**.
3. Selecione o repositório `sistema_de_recomendacao_ia`.
4. Configure:
   - **Name**: `kplus-api`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn Api.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: **Free**
5. Em **Environment Variables**, adicione:
   - `DATABASE_URL` → string de conexão do Supabase
   - `JWT_KEY` → chave JWT
   - `SECRET_KEY` → chave secreta
   - `PYTHON_VERSION` → `3.11.9`
6. Clique em **"Create Web Service"**. URL gerada: `https://kplus-api.onrender.com`

> ⚠️ **Atenção**: No tier gratuito, o Render hiberna a instância após 15 min de inatividade. A primeira requisição pode levar até 50 segundos para "acordar" o servidor. Para uso em apresentações, faça uma requisição de aquecimento antes.

---

### Opção C: Oracle Cloud Always Free (Melhor Performance — 24 GB RAM Permanentemente)

A Oracle oferece **instâncias ARM com 4 vCPUs e 24 GB de RAM permanentemente grátis** (sem limite de tempo, sem cartão obrigatório após ativação). É a melhor opção técnica, mas requer mais configuração manual.

1. Crie uma conta em [cloud.oracle.com](https://cloud.oracle.com) (requer cartão de crédito para verificação, mas **não cobra nada** no Always Free).
2. Crie uma instância **Ampere A1 Compute** (ARM):
   - Shape: `VM.Standard.A1.Flex` → 4 OCPUs, 24 GB RAM
   - Imagem: `Canonical Ubuntu 22.04`
3. Configure regras de firewall (Security Lists) para liberar as portas **22 (SSH)** e **8000 (API)**.
4. Conecte via SSH e execute:
   ```bash
   # Instala dependências
   sudo apt update && sudo apt install -y python3-pip python3-venv git
   git clone https://github.com/SEU_USUARIO/sistema_de_recomendacao_ia.git
   cd sistema_de_recomendacao_ia

   # Cria ambiente virtual e instala
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt

   # Configura variáveis de ambiente
   export DATABASE_URL="sua_url_supabase"
   export JWT_KEY="sua_chave_jwt"
   export SECRET_KEY="sua_chave_secreta"

   # Inicia com systemd (para manter rodando após fechar o SSH)
   uvicorn Api.main:app --host 0.0.0.0 --port 8000
   ```
5. Para tornar permanente, configure um serviço `systemd` ou use `pm2` + `nohup`.

---

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
   - **Value**: URL do seu backend online (ex: `https://kplus-api-production.up.railway.app` ou `https://kplus-api.onrender.com`).
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
   - O motor híbrido usa pesos calibrados automaticamente (Semântico 50%, Textual 20%, Colaborativo 30%) — nenhuma configuração necessária.
4. **Avaliação Interativa**:
   - Clicando em "Criar Usuário de Teste (1 Clique)", o sistema gera uma conta temporária instantânea.
   - Ao clicar nas estrelas de 1 a 5 em qualquer filme, a avaliação é salva no banco na hora (`POST /midias/avaliar`).
5. **Inspetor Técnico da API**:
   - A qualquer momento, avaliadores podem abrir a aba de inspeção técnica para ver o tempo de resposta em milissegundos, status HTTP e o JSON bruto retornado pelo algoritmo.
