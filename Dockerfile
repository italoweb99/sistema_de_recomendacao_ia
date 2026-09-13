# Usa imagem Python oficial slim
FROM python:3.11-slim

# Evita que o Python gere arquivos .pyc e força stdout imediato
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Instala dependências do sistema necessárias para compilação e rede
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Pré-baixa os pesos do modelo MiniLM para inicialização instantânea do container
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"

# Copia o código da API
COPY Api /app/Api

EXPOSE 8000

# Comando de inicialização
CMD ["sh", "-c", "uvicorn Api.main:app --host 0.0.0.0 --port ${PORT}"]
