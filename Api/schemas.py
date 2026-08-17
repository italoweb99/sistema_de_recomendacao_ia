from pydantic import BaseModel,Field
from typing import Optional

class UsuarioCadastro(BaseModel):
    email: str
    nome: str
    senha: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario_id: int
    nome: str

class AvaliacaoSchema(BaseModel):
    id_tmdb: int
    tipo: str  # 'movie' ou 'tv'
    nota: float = Field(..., ge=1.0, le=5.0, description="Nota de 1.0 a 5.0")

class MidiaResponse(BaseModel):
    id_tmdb: int
    tipo: str
    titulo: str
    sinopse: Optional[str] = None
    generos: Optional[str] = None
    url_capa: Optional[str] = None
    score_final: Optional[float] = None
