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

### Opção C: Oracle Cloud Always Free — Guia Completo (24 GB RAM Permanentemente)

A Oracle oferece **instâncias ARM com 4 vCPUs e 24 GB de RAM permanentemente grátis** (sem limite de tempo e sem cobrança). É a melhor opção técnica para este projeto.

---

#### C.1 — Criar a Conta Oracle Cloud

1. Acesse [cloud.oracle.com](https://cloud.oracle.com) e clique em **"Try Oracle Cloud Free Tier"**.
2. Preencha seus dados (nome, e-mail, país → selecione **Brazil**).
3. Escolha sua **Home Region** — selecione **Brazil East (São Paulo)** para menor latência.
4. Informe um cartão de crédito válido (usado **apenas para verificação de identidade**; o plano Always Free **nunca cobra**).
5. Aguarde o e-mail de confirmação e faça login no **Oracle Cloud Console**.

---

#### C.2 — Criar a Instância VM (Ampere A1 ARM)

1. No menu principal (☰), vá em **Compute** → **Instances** → **Create Instance**.
2. Preencha:
   - **Name**: `kplus-api-server`
   - **Compartment**: deixe o padrão (root)
3. Em **Image and shape**, clique em **Edit**:
   - **Image**: `Canonical Ubuntu` → selecione **Ubuntu 22.04 Minimal (aarch64)**
     > ⚠️ Para a arquitetura ARM (aarch64), a Oracle disponibiliza apenas a imagem **Minimal**. Ela não tem interface gráfica e vem sem alguns pacotes, mas funciona perfeitamente para servidores — os comandos do passo C.5 instalam tudo o que falta.
   - **Shape**: clique em **Change Shape** → selecione **Ampere** → `VM.Standard.A1.Flex`
   - Defina **4 OCPUs** e **24 GB RAM** (dentro do limite Always Free)
4. Em **Networking**, deixe a VCN padrão criada automaticamente (ou crie uma nova).
5. Em **Add SSH keys**:
   - Selecione **Generate a key pair for me**
   - Clique em **Save private key** para baixar o arquivo `ssh-key-XXXXX.key`
   - Guarde este arquivo com segurança — é a única forma de acessar o servidor!
6. Clique em **Create**. A instância ficará no estado **Provisioning** por ~2 minutos, depois **Running**.
7. Anote o **IP Público** da instância (visível na tela de detalhes).

> #### ⚠️ Erro "Out of capacity for shape VM.Standard.A1.Flex"?
>
> Esse erro é **extremamente comum** — as instâncias ARM gratuitas são muito disputadas. Tente as soluções abaixo **em ordem**:
>
> **Solução 1 — Trocar o Availability Domain:**
> Na tela de criação, role até **Placement** e mude o **Availability domain** de `AD-1` para `AD-2` ou `AD-3` (se disponíveis na sua região). São Paulo geralmente tem apenas 1 AD, mas vale tentar.
>
> **Solução 2 — Remover o Fault Domain:**
> Na mesma seção **Placement**, certifique-se de que **Fault domain** está como `Let Oracle choose` (sem valor fixo). Clique em **Create** novamente.
>
> **Solução 3 — Script de Retry Automático (mais eficaz):**
> A Oracle libera capacidade aleatoriamente ao longo do dia. O método mais confiável é um script que tenta criar a instância repetidamente até conseguir. Instale a [OCI CLI](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm) e configure com `oci setup config`, depois adapte o script:
>
> ```powershell
> # Script PowerShell — tenta criar a instância a cada 5 minutos
> # Preencha os valores abaixo com os dados do seu ambiente OCI
> $compartmentId  = "ocid1.compartment.oc1..SEU_COMPARTMENT_OCID"
> $subnetId       = "ocid1.subnet.oc1.sa-saopaulo-1.SEU_SUBNET_OCID"
> $imageId        = "ocid1.image.oc1.sa-saopaulo-1.SEU_IMAGE_OCID"  # Ubuntu 22.04 Minimal aarch64
> $sshPublicKey   = Get-Content "$HOME\.ssh\id_rsa.pub" -Raw
>
> while ($true) {
>     $result = oci compute instance launch `
>         --availability-domain "qFyq:SA-SAOPAULO-1-AD-1" `
>         --compartment-id $compartmentId `
>         --shape "VM.Standard.A1.Flex" `
>         --shape-config '{"ocpus": 4, "memoryInGBs": 24}' `
>         --image-id $imageId `
>         --subnet-id $subnetId `
>         --assign-public-ip true `
>         --ssh-authorized-keys-file "$HOME\.ssh\id_rsa.pub" `
>         --display-name "kplus-api-server" 2>&1
>
>     if ($LASTEXITCODE -eq 0) {
>         Write-Host "✅ Instância criada com sucesso!" -ForegroundColor Green
>         break
>     }
>     Write-Host "$(Get-Date -Format 'HH:mm:ss') — Sem capacidade. Tentando de novo em 5 minutos..." -ForegroundColor Yellow
>     Start-Sleep -Seconds 300
> }
> ```
>
> > 💡 **Dica**: Deixe o script rodando em segundo plano (minimizado). Normalmente a capacidade abre em algumas horas, às vezes minutos. Muitos usuários conseguem em menos de 24h.


---

#### C.3 — Abrir as Portas no Firewall da Oracle (Security List)

Por padrão, a Oracle bloqueia todas as portas exceto 22 (SSH). Você precisa abrir as portas 80 (HTTP) e 443 (HTTPS):

1. Na tela da instância, clique na **Subnet** listada em **Primary VNIC**.
2. Na tela da Subnet, clique em **Security List** (geralmente `Default Security List for...`).
3. Clique em **Add Ingress Rules** e adicione as seguintes regras:

   | Source CIDR | Protocol | Port Range | Descrição |
   |---|---|---|---|
   | `0.0.0.0/0` | TCP | `80` | HTTP |
   | `0.0.0.0/0` | TCP | `443` | HTTPS |

4. Clique em **Add Ingress Rules** para salvar.

---

#### C.4 — Conectar ao Servidor via SSH

**No Windows (PowerShell):**
```powershell
# Ajuste as permissões da chave (necessário no Windows)
icacls "C:\caminho\para\ssh-key-XXXXX.key" /inheritance:r /grant:r "$($env:USERNAME):R"

# Conecte ao servidor (substitua pelo seu IP público)
ssh -i "C:\caminho\para\ssh-key-XXXXX.key" ubuntu@SEU_IP_PUBLICO
```

---

#### C.5 — Configurar o Servidor Ubuntu

Após conectar via SSH, execute os comandos abaixo **em ordem**:

```bash
# 1. Atualizar o sistema
sudo apt update && sudo apt upgrade -y

# 2. Instalar dependências
sudo apt install -y python3-pip python3-venv git nginx certbot python3-certbot-nginx

# 3. Abrir portas no firewall interno do Ubuntu (iptables)
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 8000 -j ACCEPT
sudo apt install -y iptables-persistent
sudo netfilter-persistent save

# 4. Clonar o repositório
git clone https://github.com/SEU_USUARIO/sistema_de_recomendacao_ia.git
cd sistema_de_recomendacao_ia

# 5. Criar ambiente virtual e instalar dependências Python
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

---

#### C.6 — Configurar as Variáveis de Ambiente

```bash
# Crie o arquivo de variáveis de ambiente
sudo nano /etc/kplus-api.env
```

Cole o conteúdo abaixo (substituindo pelos seus valores reais):
```
DATABASE_URL=postgresql://postgres.XXXXX:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require
JWT_KEY=kplus_jwt_super_secreto_2026_troque_por_algo_aleatorio
SECRET_KEY=kplus_secret_key_2026_troque_por_algo_aleatorio
PORT=8000
```

Salve com `Ctrl+O`, `Enter`, `Ctrl+X`.

```bash
# Proteja o arquivo de variáveis
sudo chmod 600 /etc/kplus-api.env
```

---

#### C.7 — Criar o Serviço systemd (Reinício Automático)

```bash
sudo nano /etc/systemd/system/kplus-api.service
```

Cole o conteúdo:
```ini
[Unit]
Description=KPlus API - Recomendador Híbrido Triplo
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/sistema_de_recomendacao_ia
EnvironmentFile=/etc/kplus-api.env
ExecStart=/home/ubuntu/sistema_de_recomendacao_ia/venv/bin/uvicorn Api.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Salve e ative o serviço:
```bash
sudo systemctl daemon-reload
sudo systemctl enable kplus-api
sudo systemctl start kplus-api

# Verificar se está rodando:
sudo systemctl status kplus-api
```

Se aparecer `active (running)` em verde, o servidor está funcionando! ✅

---

#### C.8 — Configurar o Nginx como Proxy Reverso (com HTTPS grátis)

```bash
sudo nano /etc/nginx/sites-available/kplus-api
```

Cole o conteúdo (substitua `SEU_DOMINIO.com` pelo seu domínio ou IP):
```nginx
server {
    listen 80;
    server_name SEU_DOMINIO.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

```bash
# Ativar a configuração
sudo ln -s /etc/nginx/sites-available/kplus-api /etc/nginx/sites-enabled/
sudo nginx -t   # Verifica se não há erros de sintaxe
sudo systemctl restart nginx
```

---

#### C.9 — HTTPS Gratuito com Let's Encrypt (opcional, requer domínio)

> 💡 Se você não tem um domínio, pode usar um subdomínio gratuito em [duckdns.org](https://duckdns.org) — crie um subdomínio como `kplus-api.duckdns.org` apontando para o IP da Oracle.

```bash
# Instalar certificado SSL (substitua pelo seu domínio)
sudo certbot --nginx -d SEU_DOMINIO.com

# Renovação automática (já configurada pelo certbot, verifique com):
sudo systemctl status certbot.timer
```

Após o certbot, seu backend estará disponível em `https://SEU_DOMINIO.com` com SSL gratuito!

---

#### C.10 — Comandos Úteis de Manutenção

```bash
# Ver logs em tempo real da API
sudo journalctl -u kplus-api -f

# Reiniciar a API após atualizar o código
cd ~/sistema_de_recomendacao_ia && git pull
sudo systemctl restart kplus-api

# Verificar uso de memória (deve ficar em ~1.2 GB dos 24 GB disponíveis)
free -h

# Verificar status do servidor web
sudo systemctl status nginx
```

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
