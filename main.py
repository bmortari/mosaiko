"""
Sistema de Checagem de Fatos - Aplicação Principal
Estrutura simplificada e minimalista
"""

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

# Importa as rotas do módulo
from app.modules.routes import router as mosaiko_router

# === APLICAÇÃO PRINCIPAL ===
app = FastAPI(
    title="Sistema de Checagem de Fatos",
    description="Sistema simplificado para verificação de informações com IA",
    version="2.0"
)

# === MIDDLEWARE CORS ===
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === ARQUIVOS ESTÁTICOS E TEMPLATES ===
app.mount("/static", StaticFiles(directory="app/frontend"), name="static")
templates = Jinja2Templates(directory="app/templates")

# === ROTAS DA API ===
app.include_router(mosaiko_router, prefix="/mosaiko", tags=["Checagem de Fatos"])

# === ROTA DA PÁGINA PRINCIPAL ===
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Redireciona para a página do sistema"""
    return templates.TemplateResponse("mosaiko.html", {"request": request})

@app.get("/mosaiko", response_class=HTMLResponse)
async def mosaiko_page(request: Request):
    """Página principal do sistema de checagem"""
    return templates.TemplateResponse("mosaiko.html", {"request": request})

# === ROTA DE SAÚDE ===
@app.get("/health")
async def health():
    """Verifica se a aplicação está funcionando"""
    return {
        "status": "ok",
        "app": "Sistema de Checagem de Fatos",
        "version": "2.0"
    }