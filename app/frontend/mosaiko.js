// ========================================
// SISTEMA DE CHECAGEM - VERSÃO COMPLETA
// ========================================

// Estado global
let projetoAtual = null;
let dadosProjetoAtual = null;
let modulosExecutados = [];

const TITULOS_MODULOS = {
    'modulo1': '📥 Módulo 1: Extração',
    'modulo2': '🔎 Módulo 2: Alegações',
    'modulo3': '📚 Módulo 3: Evidências',
    'modulo4': '⚖️ Módulo 4: Veredito'
};

// ========================================
// INICIALIZAÇÃO
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    carregarProjetos();
    
    document.querySelectorAll('.btn-visualizar').forEach(btn => {
        btn.addEventListener('click', visualizarResultadoModulo);
    });
    document.querySelectorAll('.btn-rerun').forEach(btn => {
        btn.addEventListener('click', reExecutarModulo);
    });

    const urlParams = new URLSearchParams(window.location.search);
    const projetoIdUrl = urlParams.get('projeto_id');
    const projetoIdLocal = localStorage.getItem('projeto_id_atual');
    
    if (projetoIdUrl) {
        carregarProjetoPorId(projetoIdUrl);
    } else if (projetoIdLocal) {
        carregarProjetoPorId(projetoIdLocal);
    } else {
        atualizarEstadoBotoes();
    }
});

async function carregarProjetoPorId(projetoId) {
    try {
        const response = await fetch(`/mosaiko/projetos/${projetoId}`);
        if (response.ok) {
            const data = await response.json();
            
            projetoAtual = projetoId;
            dadosProjetoAtual = data;
            // Usar Set para garantir que não haja duplicados na contagem
            modulosExecutados = [...new Set(data.modulos_executados || [])];
            
            const select = document.getElementById('projetoSelect');
            if (select) select.value = projetoId;
            
            if (modulosExecutados.includes('modulo1')) {
                preencherEdesabilitarFormulario(data.dados_iniciais);
            } else {
                habilitarElimparFormulario();
            }
            
            if (data.resultados && Object.keys(data.resultados).length > 0) {
                exibirProjetoCarregado(data);
            } else {
                limparResultados();
            }
            
            localStorage.setItem('projeto_id_atual', projetoId);
        }
    } catch (error) {
        console.error('Erro ao carregar projeto:', error);
        mostrarMensagem('Falha ao carregar projeto. Pode ter sido excluído.', 'erro');
        selecionarProjeto(); // Reseta para "Novo Projeto"
    } finally {
        atualizarEstadoBotoes();
    }
}

// ========================================
// GERENCIAMENTO DE PROJETOS
// ========================================

async function carregarProjetos() {
    try {
        const response = await fetch('/mosaiko/projetos/listar');
        const data = await response.json();
        
        const select = document.getElementById('projetoSelect');
        select.innerHTML = '<option value="">Novo Projeto</option>';
        
        data.projetos.forEach(projeto => {
            const option = document.createElement('option');
            option.value = projeto.projeto_id;
            option.textContent = `${projeto.nome} (${projeto.modulos_executados} exec) - ${formatarData(projeto.criado_em, true)}`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar projetos:', error);
    }
}

async function criarNovoProjeto() {
    const nome = prompt('Nome do novo projeto:');
    if (!nome) return;
    
    try {
        const response = await fetch('/mosaiko/projetos/novo', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nome: nome, descricao: '' })
        });
        
        const data = await response.json();
        projetoAtual = data.projeto_id;
        dadosProjetoAtual = null;
        modulosExecutados = [];
        
        localStorage.setItem('projeto_id_atual', projetoAtual);
        
        const url = new URL(window.location);
        url.searchParams.set('projeto_id', projetoAtual);
        window.history.pushState({}, '', url);
        
        await carregarProjetos();
        document.getElementById('projetoSelect').value = projetoAtual;
        
        habilitarElimparFormulario();
        limparResultados();
        mostrarMensagem(`Projeto "${nome}" criado com sucesso!`, 'sucesso');
        
    } catch (error) {
        mostrarMensagem('Erro ao criar projeto: ' + error.message, 'erro');
    } finally {
        atualizarEstadoBotoes();
    }
}

async function selecionarProjeto() {
    const select = document.getElementById('projetoSelect');
    const projetoId = select.value;
    
    if (!projetoId) {
        projetoAtual = null;
        dadosProjetoAtual = null;
        modulosExecutados = [];
        habilitarElimparFormulario();
        limparResultados();
        
        localStorage.removeItem('projeto_id_atual');
        const url = new URL(window.location);
        url.searchParams.delete('projeto_id');
        window.history.pushState({}, '', url);
        atualizarEstadoBotoes();
        return;
    }
    
    await carregarProjetoPorId(projetoId);
}

function exibirProjetoCarregado(data) {
    const resultadosDiv = document.getElementById('resultados');
    let html = '<div class="projeto-carregado">';
    html += `<h3>📁 Projeto: ${data.nome || 'Sem nome'}</h3>`;
    html += `<p><strong>Criado em:</strong> ${formatarData(data.criado_em)}</p>`;
    
    const modulosUnicos = [...new Set(data.modulos_executados)];
    html += `<p><strong>Módulos executados:</strong> ${modulosUnicos.length}</p>`;
    
    const ultimoModulo = modulosUnicos[modulosUnicos.length - 1];
    if (ultimoModulo && data.resultados[ultimoModulo]) {
         html += formatarResultadoModulo(TITULOS_MODULOS[ultimoModulo], data.resultados[ultimoModulo].resultado);
    }
   
    html += '</div>';
    resultadosDiv.innerHTML = html;
}

async function baixarProjeto() {
    if (!projetoAtual) {
        alert('Nenhum projeto selecionado');
        return;
    }
    window.location.href = `/mosaiko/projetos/${projetoAtual}/download`;
}

async function excluirProjeto() {
    if (!projetoAtual) {
        alert('Nenhum projeto selecionado para excluir.');
        return;
    }

    if (!confirm(`Tem certeza que deseja excluir o projeto "${dadosProjetoAtual?.nome || 'este projeto'}"? Esta ação não pode ser desfeita.`)) {
        return;
    }

    try {
        const response = await fetch(`/mosaiko/projetos/${projetoAtual}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.detail || 'Falha ao excluir o projeto.');
        }

        mostrarMensagem('Projeto excluído com sucesso!', 'sucesso');
        
        // Reseta a interface
        projetoAtual = null;
        dadosProjetoAtual = null;
        modulosExecutados = [];
        
        localStorage.removeItem('projeto_id_atual');
        const url = new URL(window.location);
        url.searchParams.delete('projeto_id');
        window.history.pushState({}, '', url);

        await carregarProjetos();
        habilitarElimparFormulario();
        limparResultados();
        
    } catch (error) {
        mostrarMensagem(error.message, 'erro');
    } finally {
        atualizarEstadoBotoes();
    }
}

// ========================================
// CONTROLE DE DEPENDÊNCIAS
// ========================================

function atualizarEstadoBotoes() {
    const temProjeto = !!projetoAtual;
    const temModulo1 = modulosExecutados.includes('modulo1');
    const temModulo2 = modulosExecutados.includes('modulo2');
    const temModulo3 = modulosExecutados.includes('modulo3');

    document.getElementById('btnBaixarProjeto').disabled = !temProjeto;
    document.getElementById('btnExcluirProjeto').disabled = !temProjeto;
    
    document.getElementById('btnModulo1').disabled = temModulo1;
    document.getElementById('btnModulo2').disabled = !temModulo1 || temModulo2;
    document.getElementById('btnModulo3').disabled = !temModulo2 || temModulo3;
    document.getElementById('btnModulo4').disabled = !temModulo3;

    document.querySelectorAll('.btn-visualizar, .btn-rerun').forEach(btn => {
        const modulo = btn.dataset.modulo;
        const jaExecutou = modulosExecutados.includes(modulo);
        const podeExecutar = 
            (modulo === 'modulo1' && temProjeto) ||
            (modulo === 'modulo2' && temModulo1) ||
            (modulo === 'modulo3' && temModulo2) ||
            (modulo === 'modulo4' && temModulo3);

        if (btn.classList.contains('btn-rerun')) {
             btn.disabled = !jaExecutou;
        } else { // btn-visualizar
            btn.disabled = !jaExecutou;
        }
    });

    atualizarBadges();
}

function atualizarBadges() {
    for (let i = 1; i <= 4; i++) {
        const modulo = `modulo${i}`;
        const btn = document.getElementById(`btnModulo${i}`);
        let badge = btn.querySelector('.badge-status');
        
        if (modulosExecutados.includes(modulo)) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'badge-status';
                btn.appendChild(badge);
            }
            badge.textContent = '✓';
        } else if (badge) {
            badge.remove();
        }
    }
}

// ========================================
// CONTROLE DO FORMULÁRIO
// ========================================

function preencherEdesabilitarFormulario(dadosIniciais) {
    const campos = ['texto', 'tipo_midia', 'url_fonte', 'contexto'];
    campos.forEach(id => {
        const campo = document.getElementById(id);
        if (campo) {
            campo.value = dadosIniciais?.[id.replace('contexto', 'contexto_adicional')] || '';
            if (id === 'tipo_midia' && !campo.value) campo.value = 'texto';
            campo.disabled = true;
            campo.style.opacity = '0.7';
        }
    });
}

function habilitarElimparFormulario() {
    const campos = ['texto', 'tipo_midia', 'url_fonte', 'contexto'];
    campos.forEach(id => {
        const campo = document.getElementById(id);
        if (campo) {
            campo.value = '';
            if (id === 'tipo_midia') campo.value = 'texto';
            campo.disabled = false;
            campo.style.opacity = '1';
        }
    });
}

// ========================================
// EXECUÇÃO DE MÓDULOS
// ========================================

function coletarDados() {
    return {
        texto: document.getElementById('texto').value,
        tipo_midia: document.getElementById('tipo_midia').value,
        url_fonte: document.getElementById('url_fonte').value || null,
        contexto_adicional: document.getElementById('contexto').value || null,
        projeto_id: projetoAtual
    };
}

function validarDados(dados, modulo) {
    if (modulo === 'modulo1' && (!dados.texto || dados.texto.trim() === '')) {
        alert('Por favor, insira um texto para verificação.');
        return false;
    }
    return true;
}

function mostrarLoading(mostrar) {
    const loading = document.getElementById('loading');
    const buttons = document.querySelectorAll('button');
    if (mostrar) {
        loading.style.display = 'block';
        buttons.forEach(btn => btn.disabled = true);
    } else {
        loading.style.display = 'none';
        atualizarEstadoBotoes();
    }
}

async function executarModulo(modulo) {
    let dados = coletarDados();
    if (!validarDados(dados, modulo)) return;
    
    if (modulo === 'modulo1' && !projetoAtual) {
        const nome = `Projeto ${new Date().toLocaleDateString('pt-BR')}`;
        const response = await fetch('/mosaiko/projetos/novo', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nome: nome })
        });
        const data = await response.json();
        projetoAtual = data.projeto_id;
        localStorage.setItem('projeto_id_atual', projetoAtual);
        dados.projeto_id = projetoAtual;
        await carregarProjetos();
        document.getElementById('projetoSelect').value = projetoAtual;
    }
    
    await chamarAPIModulo(modulo, dados);
}

async function reExecutarModulo(event) {
    const modulo = event.currentTarget.dataset.modulo;
    if (!confirm(`Você tem certeza que deseja reexecutar o ${TITULOS_MODULOS[modulo]}?\n\nIsso apagará os resultados deste e de todos os módulos seguintes.`)) {
        return;
    }
    const dadosIniciais = dadosProjetoAtual?.dados_iniciais;
    if (!dadosIniciais) {
        mostrarMensagem('Não foi possível encontrar os dados iniciais do projeto para reexecutar.', 'erro');
        return;
    }
    const dadosParaReexecucao = { ...dadosIniciais, projeto_id: projetoAtual };
    await chamarAPIModulo(modulo, dadosParaReexecucao);
}

async function chamarAPIModulo(modulo, dados) {
    mostrarLoading(true);
    try {
        const response = await fetch(`/mosaiko/${modulo}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(dados)
        });
        
        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.detail || 'Erro ao processar requisição');
        }
        
        const resultado = await response.json();
        await carregarProjetoPorId(resultado.projeto_id);
        
        exibirResultadoFormatado(TITULOS_MODULOS[modulo], resultado.resultado);
        mostrarMensagem(`${TITULOS_MODULOS[modulo]} executado com sucesso!`, 'sucesso');
        
    } catch (error) {
        console.error('Erro:', error);
        mostrarMensagem(error.message, 'erro');
    } finally {
        mostrarLoading(false);
    }
}

async function executarCompleto() {
    let dados = coletarDados();
    if (!validarDados(dados, 'modulo1')) return;
    mostrarLoading(true);
    try {
        const response = await fetch('/mosaiko/executar-completo', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(dados)
        });
        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.detail || 'Erro ao processar requisição');
        }
        const resultado = await response.json();
        await carregarProjetoPorId(resultado.projeto_id);
        exibirResultadoCompleto(resultado.resultados);
        mostrarMensagem('Checagem completa finalizada com sucesso!', 'sucesso');
    } catch (error) {
        console.error('Erro:', error);
        mostrarMensagem(error.message, 'erro');
    } finally {
        mostrarLoading(false);
    }
}

// ========================================
// FORMATAÇÃO E VISUALIZAÇÃO
// ========================================

function visualizarResultadoModulo(event) {
    const modulo = event.currentTarget.dataset.modulo;
    if (dadosProjetoAtual?.resultados?.[modulo]) {
        const resultado = dadosProjetoAtual.resultados[modulo].resultado;
        exibirResultadoFormatado(TITULOS_MODULOS[modulo], resultado);
    } else {
        mostrarMensagem('Resultado não encontrado para este módulo.', 'erro');
    }
}

function exibirResultadoFormatado(titulo, dados) {
    const resultadosDiv = document.getElementById('resultados');
    resultadosDiv.innerHTML = formatarResultadoModulo(titulo, dados);
}

function formatarResultadoModulo(titulo, dados) {
    return `
        <div class="resultado-formatado">
            <div class="resultado-header">
                <h3>${titulo}</h3>
                <span class="timestamp">${new Date().toLocaleString('pt-BR')}</span>
            </div>
            ${formatarDados(dados)}
        </div>
    `;
}

function formatarDados(dados) {
    if (dados === null || dados === undefined) return '<p class="vazio">Sem dados para exibir.</p>';
    let html = '<div class="dados-formatados">';
    if (Array.isArray(dados)) {
        html += formatarArray(dados);
    } else if (typeof dados === 'object') {
        html += formatarObjeto(dados);
    } else {
        html += `<p>${dados}</p>`;
    }
    html += '</div>';
    return html;
}

function formatarObjeto(obj) {
    let html = '<div class="objeto-formatado">';
    for (const [chave, valor] of Object.entries(obj)) {
        const chaveFormatada = formatarChave(chave);
        html += `<div class="campo"><strong>${chaveFormatada}:</strong> `;
        if (Array.isArray(valor)) {
            html += formatarArray(valor);
        } else if (typeof valor === 'object' && valor !== null) {
            html += `<div class="sub-objeto">${formatarObjeto(valor)}</div>`;
        } else if (typeof valor === 'boolean') {
            html += `<span class="badge ${valor ? 'badge-sim' : 'badge-nao'}">${valor ? 'Sim' : 'Não'}</span>`;
        } else if (typeof valor === 'number') {
            html += `<span class="numero">${formatarNumero(valor)}</span>`;
        } else if (isURL(valor)) {
            html += `<a href="${valor}" target="_blank">${valor}</a>`;
        } else {
            html += `<span>${valor || '<span class="vazio">Vazio</span>'}</span>`;
        }
        html += `</div>`;
    }
    html += '</div>';
    return html;
}

function formatarArray(arr) {
    if (arr.length === 0) return '<p class="vazio">Nenhum item</p>';
    let html = '<ul class="lista-formatada">';
    arr.forEach(item => {
        html += '<li>';
        if (typeof item === 'object' && item !== null) {
            html += formatarObjeto(item);
        } else {
            html += item;
        }
        html += '</li>';
    });
    html += '</ul>';
    return html;
}

function exibirResultadoCompleto(resultados) {
    const resultadosDiv = document.getElementById('resultados');
    let html = '<div class="resultado-completo-formatado"><div class="resultado-header"><h3>✅ Checagem Completa Finalizada</h3>';
    html += `<span class="timestamp">${new Date().toLocaleString('pt-BR')}</span></div>`;
    Object.entries(TITULOS_MODULOS).forEach(([key, titulo]) => {
        if (resultados[key]) {
            html += `<div class="modulo-resultado-completo"><h4>${titulo}</h4>${formatarDados(resultados[key])}</div>`;
        }
    });
    html += '</div>';
    resultadosDiv.innerHTML = html;
}

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

function formatarChave(chave) {
    return chave.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatarNumero(num) {
    if (num > 0 && num < 1 && num.toString().includes('.')) {
        return (num * 100).toFixed(1) + '%';
    }
    return num.toLocaleString('pt-BR');
}

function isURL(str) {
    return typeof str === 'string' && (str.startsWith('http://') || str.startsWith('https://'));
}

function formatarData(dataISO, short = false) {
    if (!dataISO) return '-';
    const options = short 
        ? { day: '2-digit', month: '2-digit', year: '2-digit' } 
        : { dateStyle: 'medium', timeStyle: 'short' };
    return new Date(dataISO).toLocaleString('pt-BR', options);
}

function mostrarMensagem(mensagem, tipo) {
    const alertDiv = document.getElementById('alertas');
    const classe = tipo === 'sucesso' ? 'alerta-sucesso' : 'alerta-erro';
    const html = `<div class="alerta ${classe}">${mensagem}<button onclick="this.parentElement.remove()">×</button></div>`;
    alertDiv.insertAdjacentHTML('afterbegin', html);
    setTimeout(() => {
        if (alertDiv.firstChild) alertDiv.removeChild(alertDiv.lastChild);
    }, 5000);
}

function limparResultados() {
    document.getElementById('resultados').innerHTML = `<p class="empty-state">Execute um módulo ou a checagem completa para ver os resultados aqui.</p>`;
}

console.log('Sistema de checagem carregado com sucesso! Versão 2.2');