from pydantic import BaseModel
from typing import Optional

class MidiaResponse(BaseModel):
    id_tmdb: int
    tipo: str
    titulo:str
    sinopse: str
    generos: Optional[str] = None
    url_capa: Optional[str] = None
class AvaliacaoCreate(BaseModel):
    usuario_id: int
    id_tmdb: int
    tipo: str
    nota: float