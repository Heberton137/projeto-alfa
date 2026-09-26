// ============================================================
// PROJETO ALFA — LÓGICA COMPLETA (DASHBOARD & QUESTÕES)
// ============================================================

// Credenciais públicas do Supabase (Projeto Alfa)
const SUPABASE_URL = 'https://maqnmxskvoccaxfoyojj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EgfPySKJgkJw4MFnT1Mt_A_ILc1IU8x';

// Função para obter a instância do cliente Supabase de forma segura
function getSupabaseClient() {
    if (window.supabaseClientInstance) return window.supabaseClientInstance;
    if (window.supabase) {
        window.supabaseClientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return window.supabaseClientInstance;
    }
    return null;
}

// Estado global da questão e métricas
let questaoAtual = null;
let alternativaSelecionadaId = null;
let tempoInicio = null;
let questaoAnteriorId = null;

// Inicialização automatizada ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('stats-dashboard')) {
        carregarMetricasDashboard();
    }
    
    if (document.getElementById('container-questao')) {
        carregarQuestaoAleatoria();
    }
});

// ============================================================
// LÓGICA DO DASHBOARD DE DESEMPENHO (index.html)
// ============================================================

async function carregarMetricasDashboard() {
    const elTotal = document.getElementById('stat-total');
    const elAcerto = document.getElementById('stat-acerto');
    const elTempo = document.getElementById('stat-tempo');

    const client = getSupabaseClient();
    let registrosSupabase = [];

    // 1. Tenta carregar dados do Supabase
    if (client) {
        try {
            const { data, error } = await client
                .from('desempenho')
                .select('correto, tempo_resposta_segundos');

            if (error) {
                console.warn('Supabase RLS/Permissão:', error.message);
            } else if (data) {
                registrosSupabase = data;
            }
        } catch (err) {
            console.error('Erro na requisição ao Supabase:', err);
        }
    }

    // 2. Resgata também dados locais do navegador (Garantia/Backup)
    let registrosLocais = [];
    try {
        registrosLocais = JSON.parse(localStorage.getItem('alfa_desempenho_local') || '[]');
    } catch (e) {
        registrosLocais = [];
    }

    // Seleciona a fonte que tiver o maior histórico de dados
    const registrosFinal = registrosSupabase.length >= registrosLocais.length 
        ? registrosSupabase 
        : registrosLocais;

    if (!registrosFinal || registrosFinal.length === 0) {
        if (elTotal) elTotal.innerText = '0';
        if (elAcerto) elAcerto.innerText = '0%';
        if (elTempo) elTempo.innerText = '0s';
        return;
    }

    // Cálculos de métricas
    const total = registrosFinal.length;
    const acertos = registrosFinal.filter(r => r.correto === true || r.correto === 'true').length;
    const taxaAcerto = Math.round((acertos / total) * 100);

    const tempoTotal = registrosFinal.reduce((acc, r) => acc + (Number(r.tempo_resposta_segundos) || 0), 0);
    const tempoMedio = Math.round(tempoTotal / total);

    // Renderização no DOM
    if (elTotal) elTotal.innerText = total;
    if (elAcerto) elAcerto.innerText = `${taxaAcerto}%`;
    if (elTempo) elTempo.innerText = `${tempoMedio}s`;
}

// ============================================================
// LÓGICA DO MÓDULO DE QUESTÕES (paginas/questoes.html)
// ============================================================

async function carregarQuestaoAleatoria() {
    const container = document.getElementById('container-questao');
    if (!container) return;

    const client = getSupabaseClient();

    if (!client) {
        container.innerHTML = `
            <div class="alerta erro">
                <h3>Erro de Inicialização</h3>
                <p>Não foi possível carregar a biblioteca do Supabase. Verifique a sua ligação à internet.</p>
            </div>
        `;
        return;
    }

    questaoAtual = null;
    alternativaSelecionadaId = null;
    container.innerHTML = '<p class="carregando">Carregando questão do Supabase...</p>';

    try {
        const { data: questoes, error } = await client
            .from('questoes')
            .select(`
                id,
                enunciado,
                tipo,
                disciplinas ( id, nome ),
                assuntos ( id, nome ),
                alternativas ( id, letra, texto, correta ),
                resolucoes ( id, texto )
            `);

        if (error) throw error;

        if (!questoes || questoes.length === 0) {
            container.innerHTML = `
                <div class="alerta aviso">
                    <h3>Nenhuma questão encontrada</h3>
                    <p>Cadastre questões na base de dados para começar os treinos.</p>
                </div>
            `;
            return;
        }

        let candidatas = questoes.filter(q => q.id !== questaoAnteriorId);
        if (candidatas.length === 0) candidatas = questoes;

        const indiceSorteado = Math.floor(Math.random() * candidatas.length);
        questaoAtual = candidatas[indiceSorteado];
        questaoAnteriorId = questaoAtual.id;

        if (questaoAtual.alternativas) {
            questaoAtual.alternativas.sort((a, b) => a.letra.localeCompare(b.letra));
        }

        renderizarQuestao(questaoAtual);
        tempoInicio = Date.now();

    } catch (err) {
        console.error('Erro ao buscar questão:', err);
        container.innerHTML = `
            <div class="alerta erro">
                <p>Erro ao carregar a questão do Supabase: ${err.message}</p>
            </div>
        `;
    }
}

function renderizarQuestao(q) {
    const container = document.getElementById('container-questao');
    
    const disciplinaNome = q.disciplinas?.nome || 'Geral';
    const assuntoNome = q.assuntos?.nome || 'Geral';

    let htmlAlternativas = '';
    if (q.alternativas && q.alternativas.length > 0) {
        htmlAlternativas = q.alternativas.map(alt => `
            <label class="opcao-alternativa" id="label-alt-${alt.id}">
                <input type="radio" name="alternativa" value="${alt.id}" onchange="selecionarAlternativa('${alt.id}')">
                <span class="letra">${alt.letra})</span>
                <span class="texto">${alt.texto}</span>
            </label>
        `).join('');
    }

    const textoResolucao = q.resolucoes && q.resolucoes.length > 0 
        ? (q.resolucoes[0].texto || 'Resolução disponível.').replace(/\n/g, '<br>')
        : 'Sem resolução cadastrada.';

    container.innerHTML = `
        <div class="card-questao">
            <div class="cabecalho-questao">
                <span class="badge disciplina">${disciplinaNome}</span>
                <span class="badge assunto">${assuntoNome}</span>
            </div>

            <div class="enunciado-questao">
                <p>${q.enunciado}</p>
            </div>

            <div class="lista-alternativas">
                ${htmlAlternativas}
            </div>

            <div class="acoes-questao">
                <button id="btn-responder" class="btn btn-primario" onclick="responderQuestao()" disabled>Responder</button>
                <button id="btn-proxima" class="btn btn-secundario" onclick="carregarQuestaoAleatoria()" style="display: none;">Próxima Questão →</button>
            </div>

            <div id="feedback-resposta" class="feedback-container"></div>

            <div id="box-resolucao" class="box-resolucao" style="display: none;">
                <h4>Resolução Comentada</h4>
                <div class="texto-resolucao">
                    ${textoResolucao}
                </div>
            </div>
        </div>
    `;
}

function selecionarAlternativa(id) {
    alternativaSelecionadaId = id;
    
    document.querySelectorAll('.opcao-alternativa').forEach(el => el.classList.remove('selecionada'));
    
    const label = document.getElementById(`label-alt-${id}`);
    if (label) label.classList.add('selecionada');

    const btn = document.getElementById('btn-responder');
    if (btn) btn.disabled = false;
}

async function responderQuestao() {
    if (!questaoAtual || !alternativaSelecionadaId) return;

    const client = getSupabaseClient();

    const altSelecionada = questaoAtual.alternativas.find(a => a.id === alternativaSelecionadaId);
    const altCorreta = questaoAtual.alternativas.find(a => a.correta === true);
    const eCorreto = Boolean(altSelecionada?.correta);

    const tempoFim = Date.now();
    const tempoRespostaSegundos = tempoInicio ? Math.round((tempoFim - tempoInicio) / 1000) : 0;

    const feedbackDiv = document.getElementById('feedback-resposta');
    const boxResolucao = document.getElementById('box-resolucao');
    const btnResponder = document.getElementById('btn-responder');
    const btnProxima = document.getElementById('btn-proxima');

    document.querySelectorAll('input[name="alternativa"]').forEach(input => input.disabled = true);
    if (btnResponder) {
        btnResponder.disabled = true;
        btnResponder.innerText = 'Gravando...';
    }

    const novoRegistro = {
        questao_id: questaoAtual.id,
        alternativa_escolhida_id: alternativaSelecionadaId,
        correto: eCorreto,
        tempo_resposta_segundos: tempoRespostaSegundos
    };

    // 1. Grava no LocalStorage (Garantia de funcionamento imediato no painel)
    try {
        const historicoLocal = JSON.parse(localStorage.getItem('alfa_desempenho_local') || '[]');
        historicoLocal.push(novoRegistro);
        localStorage.setItem('alfa_desempenho_local', JSON.stringify(historicoLocal));
    } catch (errLocal) {
        console.error('Erro ao guardar desempenho localmente:', errLocal);
    }

    // 2. Grava no Supabase
    if (client) {
        try {
            const { error: erroGravacao } = await client
                .from('desempenho')
                .insert([novoRegistro]);

            if (erroGravacao) {
                console.warn('Aviso Supabase ao gravar desempenho (verifique as regras RLS da tabela desempenho):', erroGravacao.message);
            }
        } catch (err) {
            console.error('Erro ao gravar no Supabase:', err);
        }
    }

    if (btnResponder) btnResponder.innerText = 'Respondido';
    if (btnProxima) btnProxima.style.display = 'inline-block';

    document.querySelectorAll('.opcao-alternativa').forEach(el => {
        const altId = el.id.replace('label-alt-', '');
        if (altId === altCorreta?.id) {
            el.classList.add('correta');
        } else if (altId === alternativaSelecionadaId && !eCorreto) {
            el.classList.add('incorreta');
        }
    });

    if (eCorreto) {
        feedbackDiv.innerHTML = `
            <div class="alerta sucesso">
                <strong>Parabéns! Resposta Correta.</strong> (Alternativa ${altSelecionada.letra}) — Tempo: ${tempoRespostaSegundos}s
            </div>
        `;
    } else {
        feedbackDiv.innerHTML = `
            <div class="alerta erro">
                <strong>Resposta Incorreta!</strong> A alternativa correta é a <strong>${altCorreta ? altCorreta.letra : 'C'}</strong>. — Tempo: ${tempoRespostaSegundos}s
            </div>
        `;
    }

    if (boxResolucao) {
        boxResolucao.style.display = 'block';
    }
}
