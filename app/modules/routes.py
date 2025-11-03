# app/modules/routes.py
"""
Sistema de checagem de fatos com:
- Passagem de dados entre módulos
- Endpoints diferentes por tipo de mídia
- Sistema de logs em JSON
- Gerenciamento de projetos
"""

import httpx
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# === CONFIGURAÇÕES ===

# Diretório para salvar logs
LOGS_DIR = Path("logs_projetos")
LOGS_DIR.mkdir(exist_ok=True)

# URLs do N8N
N8N_MODULO1_URLS = {
    "texto": "http://157.173.125.173:5678/webhook/ff358078-4759-49dc-86fd-16cc7c7ea4e8",
    "imagem": "http://157.173.125.173:5678/webhook-test/67b7a0e3-a7cc-48ac-96a3-2fb422bf9f65",
    "audio": "http://157.173.125.173:5678/webhook/modulo1-extracao-audio",
    "video": "http://157.173.125.173:5678/webhook/modulo1-extracao-video"
}
N8N_OUTROS_MODULOS_URLS = {
    "modulo2": "http://157.173.125.173:5678/webhook/1917335f-1d62-4eae-9eff-31b4210f9cd8",
    "modulo3": "http://157.173.125.173:5678/webhook/22226faa-540f-4a3c-b536-721ea57c274c",
    "modulo4": "http://157.173.125.173:5678/webhook/3ac05573-2715-4a59-a464-3e04845e8087"
}

# === ARMAZENAMENTO DE SESSÕES (em memória) ===
sessoes = {}

# === MODELOS DE DADOS ===

class CheckRequest(BaseModel):
    texto: str
    tipo_midia: str = "texto"
    url_fonte: Optional[str] = None
    contexto_adicional: Optional[str] = None
    projeto_id: Optional[str] = None

class ProjetoCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None

# === ROUTER ===
router = APIRouter()

# === FUNÇÕES AUXILIARES ===

def limpar_resultados_subsequentes(sessao: Dict[str, Any], modulo_atual: str):
    """Apaga os resultados e registros de execução dos módulos que vêm depois do atual."""
    modulos_sequencia = ["modulo1", "modulo2", "modulo3", "modulo4"]
    if modulo_atual not in modulos_sequencia:
        return

    indice_atual = modulos_sequencia.index(modulo_atual)
    modulos_para_limpar = modulos_sequencia[indice_atual:] # Limpa o atual e os subsequentes

    # Remove da lista de executados
    modulos_executados_filtrados = [m for m in sessao.get("modulos_executados", []) if m not in modulos_para_limpar]
    sessao["modulos_executados"] = modulos_executados_filtrados

    # Remove dos resultados
    for modulo in modulos_para_limpar:
        sessao["resultados"].pop(modulo, None)
    
    sessao.pop("finalizado_em", None)


def obter_url_n8n(tipo_midia: str, modulo: str) -> str:
    if modulo == "modulo1":
        if tipo_midia not in N8N_MODULO1_URLS:
            raise HTTPException(status_code=400, detail=f"Tipo de mídia '{tipo_midia}' não suportado")
        return N8N_MODULO1_URLS[tipo_midia]
    else:
        if modulo not in N8N_OUTROS_MODULOS_URLS:
            raise HTTPException(status_code=400, detail=f"Módulo '{modulo}' não encontrado")
        return N8N_OUTROS_MODULOS_URLS[modulo]

def obter_sessao(projeto_id: str) -> Dict[str, Any]:
    if projeto_id not in sessoes:
        arquivo_log = LOGS_DIR / f"{projeto_id}.json"
        if arquivo_log.exists():
            try:
                with open(arquivo_log, 'r', encoding='utf-8') as f:
                    sessoes[projeto_id] = json.load(f)
            except Exception:
                sessoes[projeto_id] = {"projeto_id": projeto_id, "modulos_executados": [], "resultados": {}, "dados_iniciais": {}, "criado_em": datetime.now().isoformat()}
        else:
            sessoes[projeto_id] = {"projeto_id": projeto_id, "modulos_executados": [], "resultados": {}, "dados_iniciais": {}, "criado_em": datetime.now().isoformat()}
    return sessoes[projeto_id]

def salvar_log_projeto(projeto_id: str, sessao: Dict[str, Any]):
    arquivo_log = LOGS_DIR / f"{projeto_id}.json"
    with open(arquivo_log, 'w', encoding='utf-8') as f:
        json.dump(sessao, f, ensure_ascii=False, indent=2)

async def chamar_n8n(url: str, dados: dict) -> dict:
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(url, json=dados)
            response.raise_for_status()
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Tempo esgotado ao processar requisição")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Erro ao conectar com N8N: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro inesperado: {str(e)}")

# === ENDPOINTS DE GERENCIAMENTO DE PROJETOS ===

@router.post("/projetos/novo")
async def criar_projeto(projeto: ProjetoCreate):
    projeto_id = str(uuid.uuid4())
    sessao = obter_sessao(projeto_id)
    sessao["nome"] = projeto.nome
    sessao["descricao"] = projeto.descricao
    salvar_log_projeto(projeto_id, sessao)
    return {"projeto_id": projeto_id, "nome": projeto.nome, "mensagem": "Projeto criado com sucesso"}

@router.get("/projetos/listar")
async def listar_projetos():
    projetos = []
    for arquivo in LOGS_DIR.glob("*.json"):
        try:
            with open(arquivo, 'r', encoding='utf-8') as f:
                dados = json.load(f)
                projetos.append({"projeto_id": dados.get("projeto_id"), "nome": dados.get("nome", "Sem nome"), "criado_em": dados.get("criado_em"), "modulos_executados": len(list(set(dados.get("modulos_executados", []))))})
        except:
            continue
    projetos.sort(key=lambda p: p.get("criado_em", ""), reverse=True)
    return {"projetos": projetos}

@router.get("/projetos/{projeto_id}")
async def obter_projeto(projeto_id: str):
    arquivo_log = LOGS_DIR / f"{projeto_id}.json"
    if not arquivo_log.exists():
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    with open(arquivo_log, 'r', encoding='utf-8') as f:
        dados = json.load(f)
    return dados

@router.get("/projetos/{projeto_id}/download")
async def download_projeto(projeto_id: str):
    arquivo_log = LOGS_DIR / f"{projeto_id}.json"
    if not arquivo_log.exists():
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return FileResponse(arquivo_log, filename=f"projeto_{projeto_id}.json", media_type="application/json")

@router.delete("/projetos/{projeto_id}")
async def deletar_projeto(projeto_id: str):
    arquivo_log = LOGS_DIR / f"{projeto_id}.json"
    if not arquivo_log.exists():
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    try:
        sessoes.pop(projeto_id, None)
        arquivo_log.unlink()
        return JSONResponse(content={"mensagem": "Projeto deletado com sucesso"}, status_code=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao deletar o projeto: {str(e)}")

# === ENDPOINTS PARA CADA MÓDULO ===

@router.post("/modulo1")
async def executar_modulo1(dados: CheckRequest):
    if not dados.projeto_id:
        dados.projeto_id = str(uuid.uuid4())
    sessao = obter_sessao(dados.projeto_id)
    
    limpar_resultados_subsequentes(sessao, "modulo1")

    sessao["dados_iniciais"] = dados.dict()
    url = obter_url_n8n(dados.tipo_midia, "modulo1")
    resultado = await chamar_n8n(url, dados.dict())
    
    sessao["modulos_executados"].append("modulo1")
    sessao["resultados"]["modulo1"] = {"timestamp": datetime.now().isoformat(), "resultado": resultado}
    
    salvar_log_projeto(dados.projeto_id, sessao)
    return {"modulo": "Extração Multi-modal", "status": "sucesso", "projeto_id": dados.projeto_id, "resultado": resultado}

@router.post("/modulo2")
async def executar_modulo2(dados: CheckRequest):
    if not dados.projeto_id:
        raise HTTPException(status_code=400, detail="projeto_id é obrigatório.")
    sessao = obter_sessao(dados.projeto_id)
    if "modulo1" not in sessao["modulos_executados"]:
        raise HTTPException(status_code=400, detail="Execute o Módulo 1 primeiro")
    
    limpar_resultados_subsequentes(sessao, "modulo2")

    dados_modulo1 = sessao["resultados"]["modulo1"]["resultado"]
    dados_para_enviar = {**sessao.get("dados_iniciais", {}), "dados_modulo1": dados_modulo1}
    url = obter_url_n8n(dados.tipo_midia, "modulo2")
    resultado = await chamar_n8n(url, dados_para_enviar)
    
    sessao["modulos_executados"].append("modulo2")
    sessao["resultados"]["modulo2"] = {"timestamp": datetime.now().isoformat(), "resultado": resultado}
    
    salvar_log_projeto(dados.projeto_id, sessao)
    return {"modulo": "Detecção de Alegações", "status": "sucesso", "projeto_id": dados.projeto_id, "resultado": resultado}

@router.post("/modulo3")
async def executar_modulo3(dados: CheckRequest):
    if not dados.projeto_id:
        raise HTTPException(status_code=400, detail="projeto_id é obrigatório.")
    sessao = obter_sessao(dados.projeto_id)
    if "modulo2" not in sessao["modulos_executados"]:
        raise HTTPException(status_code=400, detail="Execute o Módulo 2 primeiro")

    limpar_resultados_subsequentes(sessao, "modulo3")

    dados_modulo1 = sessao["resultados"]["modulo1"]["resultado"]
    dados_modulo2 = sessao["resultados"]["modulo2"]["resultado"]
    dados_para_enviar = {**sessao.get("dados_iniciais", {}), "dados_modulo1": dados_modulo1, "dados_modulo2": dados_modulo2}
    url = obter_url_n8n(dados.tipo_midia, "modulo3")
    resultado = await chamar_n8n(url, dados_para_enviar)
    
    sessao["modulos_executados"].append("modulo3")
    sessao["resultados"]["modulo3"] = {"timestamp": datetime.now().isoformat(), "resultado": resultado}
    
    salvar_log_projeto(dados.projeto_id, sessao)
    return {"modulo": "Recuperação de Evidências", "status": "sucesso", "projeto_id": dados.projeto_id, "resultado": resultado}

@router.post("/modulo4")
async def executar_modulo4(dados: CheckRequest):
    if not dados.projeto_id:
        raise HTTPException(status_code=400, detail="projeto_id é obrigatório.")
    sessao = obter_sessao(dados.projeto_id)
    if "modulo3" not in sessao["modulos_executados"]:
        raise HTTPException(status_code=400, detail="Execute o Módulo 3 primeiro")
    
    limpar_resultados_subsequentes(sessao, "modulo4")

    dados_modulo1 = sessao["resultados"]["modulo1"]["resultado"]
    dados_modulo2 = sessao["resultados"]["modulo2"]["resultado"]
    dados_modulo3 = sessao["resultados"]["modulo3"]["resultado"]
    dados_entrada_originais = sessao.get("dados_iniciais", {})
    dados_para_enviar = {**dados_entrada_originais, "dados_modulo1": dados_modulo1, "dados_modulo2": dados_modulo2, "dados_modulo3": dados_modulo3}
    url = obter_url_n8n(dados.tipo_midia, "modulo4")
    resultado = await chamar_n8n(url, dados_para_enviar)
    
    sessao["modulos_executados"].append("modulo4")
    sessao["resultados"]["modulo4"] = {"timestamp": datetime.now().isoformat(), "resultado": resultado}
    sessao["finalizado_em"] = datetime.now().isoformat()
    
    salvar_log_projeto(dados.projeto_id, sessao)
    return {"modulo": "Análise e Veredito", "status": "sucesso", "projeto_id": dados.projeto_id, "resultado": resultado}

@router.post("/executar-completo")
async def executar_completo(dados: CheckRequest):
    if not dados.projeto_id:
        dados.projeto_id = str(uuid.uuid4())
    resultados = {}
    result1 = await executar_modulo1(dados)
    resultados["modulo1"] = result1["resultado"]
    dados.projeto_id = result1["projeto_id"]
    result2 = await executar_modulo2(dados)
    resultados["modulo2"] = result2["resultado"]
    result3 = await executar_modulo3(dados)
    resultados["modulo3"] = result3["resultado"]
    result4 = await executar_modulo4(dados)
    resultados["modulo4"] = result4["resultado"]
    return {"status": "sucesso", "mensagem": "Checagem completa finalizada", "projeto_id": dados.projeto_id, "resultados": resultados}

@router.get("/health")
async def health_check():
    return {"status": "ok", "mensagem": "API funcionando corretamente", "projetos_ativos": len(sessoes), "projetos_salvos": len(list(LOGS_DIR.glob("*.json")))}