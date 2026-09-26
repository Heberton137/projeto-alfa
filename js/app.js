// ============================================================
// PROJETO ALFA — LÓGICA COMPLETA v9 (ANALYTICS SEGMENTADO & MODO SIMULADO)
// ============================================================

const SUPABASE_URL = 'https://maqnmxskvoccaxfoyojj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EgfPySKJgkJw4MFnT1Mt_A_ILc1IU8x';

function getSupabaseClient() {
    if (window.supabaseClientInstance) return window.supabaseClientInstance;
    if (window.supabase) {
        window.supabaseClientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return window.supabaseClientInstance;
    }
    return null;
}

// ESTADO DO MÓDULO DE QUESTÕES INDIVIDUAIS
let questaoAtual = null;
let alternativaSelecionadaId = null;
let questaoAnteriorId = null;

let cronometroIntervalo = null;
let segundosDecorridos = 0;

// INSTÂNCIAS DOS GRÁFICOS CHART.JS
let chartComparativoInstance = null;
let chartDisciplinasInstance = null;

// ESTADO DO MODO SIMULADO
let simuladoEstado = {
    questoes: [],
    respostas: {},
    indiceAtual: 0,
    tempoRestanteSegundos: 0,
    intervaloCronometro: null
};

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('stats-dashboard')) {
        carregarMetricasDashboard();
    }
    
    if (document.getElementById('container-questao')) {
        carregarFiltros();
        carregarQuestaoAleatoria();
    }

    if (document.getElementById('tela-config-simulado')) {
        carregarFiltrosSimulado();
    }
});

// ============================================================
// DASHBOARD DE DESEMPENHO E ANALYTICS SEGMENTADO (index.html)
// ============================================================

async function carregarMetricasDashboard() {
    const elTotalGeral = document.getElementById('stat-total');
    const elAcertoGeral = document.getElementById('stat-acerto');
    const elTempoGeral = document.getElementById('stat-tempo');

    const elTreinoTotal = document.getElementById('stat-treino-total');
    const elTreinoAcerto = document.getElementById('stat-treino-acerto');
    const elTreinoTempo = document.getElementById('stat-treino-tempo');

    const elSimuladoTotal = document.getElementById('stat-simulado-total');
    const elSimuladoAcerto = document.getElementById('stat-simulado-acerto');
    const elSimuladoQtd = document.getElementById('stat-simulado-qtd');

    const containerDisciplinas = document.getElementById('container-disciplinas-dashboard');

    const client = getSupabaseClient();
    let registrosSupabase = [];

    if (client) {
        try {
            const { data, error } = await client
                .from('desempenho')
                .select(`
                    correto, 
                    tempo_resposta_segundos,
                    origem,
                    sessao_id,
                    questoes (
                        disciplina_id,
                        disciplinas ( id, nome )
                    )
                `);

            if (!error && data) {
                registrosSupabase = data;
            }
        } catch (err) {
            console.error('Erro ao consultar Supabase:', err);
        }
    }

    let registrosLocais = [];
    try {
        registrosLocais = JSON.parse(localStorage.getItem('alfa_desempenho_local') || '[]');
    } catch (e) {
        registrosLocais = [];
    }

    const registrosFinal = registrosSupabase.length >= registrosLocais.length 
        ? registrosSupabase 
        : registrosLocais;

    if (!registrosFinal || registrosFinal.length === 0) {
        if (elTotalGeral) elTotalGeral.innerText = '0';
        if (elAcertoGeral) elAcertoGeral.innerText = '0%';
        if (elTempoGeral) elTempoGeral.innerText = '0s';

        if (elTreinoTotal) elTreinoTotal.innerText = '0';
        if (elTreinoAcerto) elTreinoAcerto.innerText = '0%';
        if (elTreinoTempo) elTreinoTempo.innerText = '0s';

        if (elSimuladoTotal) elSimuladoTotal.innerText = '0';
        if (elSimuladoAcerto) elSimuladoAcerto.innerText = '0%';
        if (elSimuladoQtd) elSimuladoQtd.innerText = '0';

        if (containerDisciplinas) {
            containerDisciplinas.innerHTML = `
                <div class="alerta aviso" style="grid-column: 1 / -1;">
                    <p>Nenhuma questão respondida ainda. Acesse o módulo de questões para começar a praticar!</p>
                </div>
            `;
        }
        atualizarBannerReadiness(0, 0);
        return;
    }

    // SEGMENTAÇÃO DE DADOS: Treino vs Simulado
    const registrosTreino = registrosFinal.filter(r => r.origem !== 'simulado');
    const registrosSimulado = registrosFinal.filter(r => r.origem === 'simulado');

    // 1. Métricas de Treino Diário
    const totalTreino = registrosTreino.length;
    const acertosTreino = registrosTreino.filter(r => r.correto === true || r.correto === 'true').length;
    const pctTreino = totalTreino > 0 ? Math.round((acertosTreino / totalTreino) * 100) : 0;
    const tempoTotalTreino = registrosTreino.reduce((acc, r) => acc + (Number(r.tempo_resposta_segundos) || 0), 0);
    const tempoMedioTreino = totalTreino > 0 ? Math.round(tempoTotalTreino / totalTreino) : 0;

    // 2. Métricas do Modo Simulado
    const totalSimulado = registrosSimulado.length;
    const acertosSimulado = registrosSimulado.filter(r => r.correto === true || r.correto === 'true').length;
    const pctSimulado = totalSimulado > 0 ? Math.round((acertosSimulado / totalSimulado) * 100) : 0;

    // Contagem de Sessões Únicas de Simulado
    const sessoesUnicas = new Set(registrosSimulado.map(r => r.sessao_id || 'default')).size;
    const qtdSimulados = totalSimulado > 0 ? (sessoesUnicas > 0 ? sessoesUnicas : 1) : 0;

    // 3. Métricas Consolidada Geral
    const totalGeral = registrosFinal.length;
    const acertosGeral = registrosFinal.filter(r => r.correto === true || r.correto === 'true').length;
    const pctGeral = Math.round((acertosGeral / totalGeral) * 100);
    const tempoTotalGeral = registrosFinal.reduce((acc, r) => acc + (Number(r.tempo_resposta_segundos) || 0), 0);
    const tempoMedioGeral = Math.round(tempoTotalGeral / totalGeral);

    // ATUALIZAÇÃO DOS ELEMENTOS DA UI
    if (elTreinoTotal) elTreinoTotal.innerText = totalTreino;
    if (elTreinoAcerto) elTreinoAcerto.innerText = `${pctTreino}%`;
    if (elTreinoTempo) elTreinoTempo.innerText = `${tempoMedioTreino}s`;

    if (elSimuladoTotal) elSimuladoTotal.innerText = totalSimulado;
    if (elSimuladoAcerto) elSimuladoAcerto.innerText = `${pctSimulado}%`;
    if (elSimuladoQtd) elSimuladoQtd.innerText = qtdSimulados;

    if (elTotalGeral) elTotalGeral.innerText = totalGeral;
    if (elAcertoGeral) elAcertoGeral.innerText = `${pctGeral}%`;
    if (elTempoGeral) elTempoGeral.innerText = `${tempoMedioGeral}s`;

    // Processamento por Disciplina
    const estatisticasPorDisciplina = {};
    registrosFinal.forEach(reg => {
        const nomeDisciplina = reg.questoes?.disciplinas?.nome || 'Disciplina Geral';
        if (!estatisticasPorDisciplina[nomeDisciplina]) {
            estatisticasPorDisciplina[nomeDisciplina] = { total: 0, acertos: 0 };
        }
        estatisticasPorDisciplina[nomeDisciplina].total += 1;
        if (reg.correto === true || reg.correto === 'true') {
            estatisticasPorDisciplina[nomeDisciplina].acertos += 1;
        }
    });

    if (containerDisciplinas) {
        containerDisciplinas.innerHTML = '';
        Object.keys(estatisticasPorDisciplina).forEach(nome => {
            const stat = estatisticasPorDisciplina[nome];
            const pct = Math.round((stat.acertos / stat.total) * 100);

            containerDisciplinas.innerHTML += `
                <div class="card-disciplina-dash">
                    <h4>${nome}</h4>
                    <div class="detalhes-disciplina-dash">
                        <span class="taxa-disciplina">${pct}%</span>
                        <span class="qtd-disciplina">${stat.acertos}/${stat.total} questões</span>
                    </div>
                    <div class="barra-progresso-fundo">
                        <div class="barra-progresso-preenchimento" style="width: ${pct}%;"></div>
                    </div>
                </div>
            `;
        });
    }

    atualizarBannerReadiness(pctSimulado, pctTreino);
    renderizarGraficosSegmentados(pctTreino, pctSimulado, estatisticasPorDisciplina);
}

function atualizarBannerReadiness(pctSimulado, pctTreino) {
    const badge = document.getElementById('readiness-level-badge');
    const score = document.getElementById('readiness-score-val');
    const desc = document.getElementById('readiness-description');

    if (!score || !badge || !desc) return;

    // Cálculo Ponderado de Prontidão: 70% peso no Simulado e 30% no Treino Diário
    let readinessVal = pctSimulado > 0 
        ? Math.round((pctSimulado * 0.7) + (pctTreino * 0.3))
        : pctTreino;

    score.innerText = `${readinessVal}%`;

    if (readinessVal >= 80) {
        badge.innerText = 'Excelente — Nível Competitivo';
        badge.style.color = '#4ade80';
        desc.innerText = 'Seu desempenho em simulados indica altíssima competitividade para a vaga de Auditor!';
    } else if (readinessVal >= 65) {
        badge.innerText = 'Bom — Fase de Ajustes';
        badge.style.color = '#facc15';
        desc.innerText = 'Você possui boa base. Aumente a frequência de simulados para dominar a gestão do tempo.';
    } else {
        badge.innerText = 'Atenção — Reforçar Base';
        badge.style.color = '#f87171';
        desc.innerText = 'Foque no Caderno de Erros e na revisão teórica dos assuntos de menor rendimento.';
    }
}

function renderizarGraficosSegmentados(pctTreino, pctSimulado, estatisticasDisciplinas) {
    if (typeof Chart === 'undefined') return;

    const ctxComparativo = document.getElementById('chart-comparativo')?.getContext('2d');
    if (ctxComparativo) {
        if (chartComparativoInstance) chartComparativoInstance.destroy();

        chartComparativoInstance = new Chart(ctxComparativo, {
            type: 'bar',
            data: {
                labels: ['Treino Diário', 'Modo Simulado'],
                datasets: [{
                    label: 'Aproveitamento (%)',
                    data: [pctTreino, pctSimulado],
                    backgroundColor: ['#2563eb', '#d97706'],
                    borderRadius: 8,
                    barThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    const ctxDisciplinas = document.getElementById('chart-disciplinas')?.getContext('2d');
    if (ctxDisciplinas) {
        if (chartDisciplinasInstance) chartDisciplinasInstance.destroy();

        const labels = Object.keys(estatisticasDisciplinas);
        const dataPct = labels.map(nome => {
            const stat = estatisticasDisciplinas[nome];
            return Math.round((stat.acertos / stat.total) * 100);
        });

        chartDisciplinasInstance = new Chart(ctxDisciplinas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Taxa de Acerto (%)',
                    data: dataPct,
                    backgroundColor: '#1e3a8a',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}

// ============================================================
// FILTROS DE PESQUISA E MÓDULO DE QUESTÕES INDIVIDUAIS
// ============================================================

async function carregarFiltros() {
    const selectDisciplina = document.getElementById('select-disciplina');
    if (!selectDisciplina) return;

    const client = getSupabaseClient();
    if (!client) return;

    try {
        const { data: disciplinas, error } = await client
            .from('disciplinas')
            .select('id, nome')
            .order('nome');

        if (error) throw error;

        selectDisciplina.innerHTML = '<option value="">Todas as Disciplinas</option>';
        if (disciplinas) {
            disciplinas.forEach(d => {
                selectDisciplina.innerHTML += `<option value="${d.id}">${d.nome}</option>`;
            });
        }

        await carregarAssuntosFiltro();

    } catch (err) {
        console.error('Erro ao carregar disciplinas:', err);
    }
}

async function carregarAssuntosFiltro(disciplinaId = '') {
    const selectAssunto = document.getElementById('select-assunto');
    if (!selectAssunto) return;

    const client = getSupabaseClient();
    if (!client) return;

    try {
        let query = client.from('assuntos').select('id, nome, disciplina_id').order('nome');
        
        if (disciplinaId) {
            query = query.eq('disciplina_id', disciplinaId);
        }

        const { data: assuntos, error } = await query;
        if (error) throw error;

        selectAssunto.innerHTML = '<option value="">Todos os Assuntos</option>';
        if (assuntos) {
            assuntos.forEach(a => {
                selectAssunto.innerHTML += `<option value="${a.id}">${a.nome}</option>`;
            });
        }
    } catch (err) {
        console.error('Erro ao carregar assuntos:', err);
    }
}

function aoMudarDisciplina() {
    const selectDisciplina = document.getElementById('select-disciplina');
    const disciplinaId = selectDisciplina ? selectDisciplina.value : '';
    carregarAssuntosFiltro(disciplinaId);
    carregarQuestaoAleatoria();
}

function aoMudarAssunto() { carregarQuestaoAleatoria(); }
function aoMudarStatus() { carregarQuestaoAleatoria(); }

function obterHistoricoRespostas() {
    try {
        return JSON.parse(localStorage.getItem('alfa_desempenho_local') || '[]');
    } catch (e) {
        return [];
    }
}

function iniciarCronometro() {
    pararCronometro();
    segundosDecorridos = 0;
    atualizarDisplayCronometro();

    cronometroIntervalo = setInterval(() => {
        segundosDecorridos++;
        atualizarDisplayCronometro();
    }, 1000);
}

function pararCronometro() {
    if (cronometroIntervalo) {
        clearInterval(cronometroIntervalo);
        cronometroIntervalo = null;
    }
}

function atualizarDisplayCronometro() {
    const elCronometro = document.getElementById('cronometro-display');
    if (elCronometro) {
        const min = Math.floor(segundosDecorridos / 60);
        const seg = segundosDecorridos % 60;
        elCronometro.innerText = `⏱️ ${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
    }
}

async function carregarQuestaoAleatoria() {
    const container = document.getElementById('container-questao');
    if (!container) return;

    pararCronometro();

    const client = getSupabaseClient();
    if (!client) {
        container.innerHTML = `<div class="alerta erro"><h3>Erro ao conectar com a base.</h3></div>`;
        return;
    }

    questaoAtual = null;
    alternativaSelecionadaId = null;
    container.innerHTML = '<p class="carregando">Carregando questão com base nos filtros...</p>';

    const disciplinaFiltroId = document.getElementById('select-disciplina')?.value || '';
    const assuntoFiltroId = document.getElementById('select-assunto')?.value || '';
    const statusFiltro = document.getElementById('select-status')?.value || 'todas';

    try {
        let query = client
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

        if (disciplinaFiltroId) query = query.eq('disciplina_id', disciplinaFiltroId);
        if (assuntoFiltroId) query = query.eq('assunto_id', assuntoFiltroId);

        const { data: questoes, error } = await query;
        if (error) throw error;

        if (!questoes || questoes.length === 0) {
            container.innerHTML = `<div class="alerta aviso"><h3>Nenhuma questão encontrada com estes filtros.</h3></div>`;
            return;
        }

        const historico = obterHistoricoRespostas();
        const idsRespondidos = new Set(historico.map(h => h.questao_id));
        const idsIncorretos = new Set(
            historico.filter(h => h.correto === false || h.correto === 'false').map(h => h.questao_id)
        );

        let questoesFiltradas = [...questoes];

        if (statusFiltro === 'ineditas') {
            questoesFiltradas = questoesFiltradas.filter(q => !idsRespondidos.has(q.id));
        } else if (statusFiltro === 'erradas') {
            questoesFiltradas = questoesFiltradas.filter(q => idsIncorretos.has(q.id));
        }

        if (questoesFiltradas.length === 0) {
            container.innerHTML = `<div class="alerta aviso"><h3>Sem questões para o status selecionado.</h3></div>`;
            return;
        }

        let candidatas = questoesFiltradas.filter(q => q.id !== questaoAnteriorId);
        if (candidatas.length === 0) candidatas = questoesFiltradas;

        const indiceSorteado = Math.floor(Math.random() * candidatas.length);
        questaoAtual = candidatas[indiceSorteado];
        questaoAnteriorId = questaoAtual.id;

        if (questaoAtual.alternativas) {
            questaoAtual.alternativas.sort((a, b) => a.letra.localeCompare(b.letra));
        }

        renderizarQuestao(questaoAtual);
        iniciarCronometro();

    } catch (err) {
        console.error(err);
    }
}

function renderizarQuestao(q) {
    const container = document.getElementById('container-questao');
    const disciplinaNome = q.disciplinas?.nome || 'Geral';
    const assuntoNome = q.assuntos?.nome || 'Geral';

    let htmlAlternativas = (q.alternativas || []).map(alt => `
        <label class="opcao-alternativa" id="label-alt-${alt.id}">
            <input type="radio" name="alternativa" value="${alt.id}" onchange="selecionarAlternativa('${alt.id}')">
            <span class="letra">${alt.letra})</span>
            <span class="texto">${alt.texto}</span>
        </label>
    `).join('');

    const textoResolucao = q.resolucoes && q.resolucoes.length > 0 
        ? q.resolucoes[0].texto.replace(/\n/g, '<br>')
        : 'Sem resolução cadastrada.';

    container.innerHTML = `
        <div class="card-questao">
            <div class="cabecalho-questao">
                <span class="badge disciplina">${disciplinaNome}</span>
                <span class="badge assunto">${assuntoNome}</span>
                <span id="cronometro-display" class="badge tempo">⏱️ 00:00</span>
            </div>
            <div class="enunciado-questao"><p>${q.enunciado}</p></div>
            <div class="lista-alternativas">${htmlAlternativas}</div>
            <div class="acoes-questao">
                <button id="btn-responder" class="btn btn-primario" onclick="responderQuestao()" disabled>Responder</button>
                <button id="btn-proxima" class="btn btn-secundario" onclick="carregarQuestaoAleatoria()" style="display: none;">Próxima Questão →</button>
            </div>
            <div id="feedback-resposta" class="feedback-container"></div>
            <div id="box-resolucao" class="box-resolucao" style="display: none;">
                <h4>Resolução Comentada</h4>
                <div class="texto-resolucao">${textoResolucao}</div>
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

    pararCronometro();

    const client = getSupabaseClient();
    const altSelecionada = questaoAtual.alternativas.find(a => a.id === alternativaSelecionadaId);
    const altCorreta = questaoAtual.alternativas.find(a => a.correta === true);
    const eCorreto = Boolean(altSelecionada?.correta);

    const novoRegistro = {
        questao_id: questaoAtual.id,
        alternativa_escolhida_id: alternativaSelecionadaId,
        correto: eCorreto,
        tempo_resposta_segundos: segundosDecorridos,
        origem: 'questoes', // TAG DE REGISTRO
        questoes: {
            disciplina_id: questaoAtual.disciplinas?.id,
            disciplinas: {
                id: questaoAtual.disciplinas?.id,
                nome: questaoAtual.disciplinas?.nome || 'Geral'
            }
        }
    };

    try {
        const historicoLocal = JSON.parse(localStorage.getItem('alfa_desempenho_local') || '[]');
        historicoLocal.push(novoRegistro);
        localStorage.setItem('alfa_desempenho_local', JSON.stringify(historicoLocal));
    } catch (e) {}

    if (client) {
        try {
            await client.from('desempenho').insert([{
                questao_id: questaoAtual.id,
                alternativa_escolhida_id: alternativaSelecionadaId,
                correto: eCorreto,
                tempo_resposta_segundos: segundosDecorridos,
                origem: 'questoes'
            }]);
        } catch (e) {}
    }

    document.getElementById('btn-responder').innerText = 'Respondido';
    document.getElementById('btn-proxima').style.display = 'inline-block';

    document.querySelectorAll('.opcao-alternativa').forEach(el => {
        const altId = el.id.replace('label-alt-', '');
        if (altId === altCorreta?.id) el.classList.add('correta');
        else if (altId === alternativaSelecionadaId && !eCorreto) el.classList.add('incorreta');
    });

    document.getElementById('feedback-resposta').innerHTML = eCorreto 
        ? `<div class="alerta sucesso"><strong>Parabéns! Resposta Correta.</strong> — ${segundosDecorridos}s</div>`
        : `<div class="alerta erro"><strong>Incorreta!</strong> Correta: <strong>${altCorreta?.letra}</strong> — ${segundosDecorridos}s</div>`;

    document.getElementById('box-resolucao').style.display = 'block';
}

// ============================================================
// MÓDULO DE MODO SIMULADO (SISTEMA COM SESSÃO E ORIGEM)
// ============================================================

async function carregarFiltrosSimulado() {
    const select = document.getElementById('simulado-disciplina');
    if (!select) return;

    const client = getSupabaseClient();
    if (!client) return;

    try {
        const { data: disciplinas } = await client.from('disciplinas').select('id, nome').order('nome');
        select.innerHTML = '<option value="">Todas as Disciplinas</option>';
        if (disciplinas) {
            disciplinas.forEach(d => select.innerHTML += `<option value="${d.id}">${d.nome}</option>`);
        }
    } catch (e) {}
}

async function iniciarSimulado() {
    const client = getSupabaseClient();
    if (!client) return;

    const disciplinaId = document.getElementById('simulado-disciplina')?.value || '';
    const qtdDemandada = parseInt(document.getElementById('simulado-qtd')?.value || '10');
    const tempoMinutos = parseInt(document.getElementById('simulado-tempo')?.value || '20');

    try {
        let query = client
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

        if (disciplinaId) query = query.eq('disciplina_id', disciplinaId);

        const { data: questoes, error } = await query;
        if (error || !questoes || questoes.length === 0) {
            alert('Não foram encontradas questões suficientes para este simulado.');
            return;
        }

        const embaralhadas = [...questoes].sort(() => Math.random() - 0.5);
        simuladoEstado.questoes = embaralhadas.slice(0, Math.min(qtdDemandada, embaralhadas.length));
        simuladoEstado.respostas = {};
        simuladoEstado.indiceAtual = 0;
        simuladoEstado.tempoRestanteSegundos = tempoMinutos * 60;

        document.getElementById('tela-config-simulado').style.display = 'none';
        document.getElementById('tela-execucao-simulado').style.display = 'block';

        iniciarCronometroSimulado();
        renderizarQuestaoSimulado();

    } catch (err) {
        console.error(err);
    }
}

function iniciarCronometroSimulado() {
    if (simuladoEstado.intervaloCronometro) clearInterval(simuladoEstado.intervaloCronometro);

    atualizarDisplayCronometroSimulado();
    simuladoEstado.intervaloCronometro = setInterval(() => {
        simuladoEstado.tempoRestanteSegundos--;
        atualizarDisplayCronometroSimulado();

        if (simuladoEstado.tempoRestanteSegundos <= 0) {
            clearInterval(simuladoEstado.intervaloCronometro);
            alert('⏱️ O Tempo Limite do Simulado Terminou! O seu teste será finalizado automaticamente.');
            finalizarSimulado();
        }
    }, 1000);
}

function atualizarDisplayCronometroSimulado() {
    const el = document.getElementById('cronometro-simulado-display');
    if (!el) return;
    const min = Math.floor(simuladoEstado.tempoRestanteSegundos / 60);
    const seg = simuladoEstado.tempoRestanteSegundos % 60;
    el.innerText = `⏳ ${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}

function renderizarQuestaoSimulado() {
    const container = document.getElementById('container-simulado-questao');
    const q = simuladoEstado.questoes[simuladoEstado.indiceAtual];
    const total = simuladoEstado.questoes.length;

    document.getElementById('info-progresso-simulado').innerText = `Questão ${simuladoEstado.indiceAtual + 1} de ${total}`;

    if (q.alternativas) {
        q.alternativas.sort((a, b) => a.letra.localeCompare(b.letra));
    }

    const respostaEscolhidaId = simuladoEstado.respostas[q.id] || null;

    let htmlAlternativas = q.alternativas.map(alt => {
        const estaSelecionada = respostaEscolhidaId === alt.id ? 'selecionada' : '';
        const estaChecked = respostaEscolhidaId === alt.id ? 'checked' : '';

        return `
            <label class="opcao-alternativa ${estaSelecionada}" id="sim-alt-${alt.id}">
                <input type="radio" name="sim-alt" value="${alt.id}" ${estaChecked} onchange="guardarRespostaSimulado('${q.id}', '${alt.id}')">
                <span class="letra">${alt.letra})</span>
                <span class="texto">${alt.texto}</span>
            </label>
        `;
    }).join('');

    const temAnterior = simuladoEstado.indiceAtual > 0;
    const eUltima = simuladoEstado.indiceAtual === total - 1;

    container.innerHTML = `
        <div class="card-questao">
            <div class="cabecalho-questao">
                <span class="badge disciplina">${q.disciplinas?.nome || 'Geral'}</span>
                <span class="badge assunto">${q.assuntos?.nome || 'Geral'}</span>
            </div>
            <div class="enunciado-questao"><p>${q.enunciado}</p></div>
            <div class="lista-alternativas">${htmlAlternativas}</div>
            <div class="acoes-questao" style="justify-content: space-between; display: flex;">
                <button class="btn btn-secundario" onclick="navegarSimulado(-1)" ${!temAnterior ? 'disabled' : ''}>← Anterior</button>
                ${eUltima 
                    ? `<button class="btn btn-primario" onclick="finalizarSimulado()" style="background-color: #16a34a; color:#ffffff;">Finalizar e Entregar Teste ✔</button>`
                    : `<button class="btn btn-primario" onclick="navegarSimulado(1)" style="background-color: #1e3a8a; color:#ffffff;">Próxima Questão →</button>`
                }
            </div>
        </div>
    `;
}

function guardarRespostaSimulado(questaoId, alternativaId) {
    simuladoEstado.respostas[questaoId] = alternativaId;
    document.querySelectorAll('.opcao-alternativa').forEach(el => el.classList.remove('selecionada'));
    const label = document.getElementById(`sim-alt-${alternativaId}`);
    if (label) label.classList.add('selecionada');
}

function navegarSimulado(delta) {
    simuladoEstado.indiceAtual += delta;
    renderizarQuestaoSimulado();
}

async function finalizarSimulado() {
    if (simuladoEstado.intervaloCronometro) clearInterval(simuladoEstado.intervaloCronometro);

    document.getElementById('tela-execucao-simulado').style.display = 'none';
    document.getElementById('tela-resultado-simulado').style.display = 'block';

    const client = getSupabaseClient();
    let totalAcertos = 0;
    let totalQuestao = simuladoEstado.questoes.length;

    // Gerar ID único para esta sessão de simulado
    const sessaoId = 'sim_' + Date.now();
    const registrosParaGravar = [];

    simuladoEstado.questoes.forEach(q => {
        const escolheuId = simuladoEstado.respostas[q.id] || null;
        const correta = q.alternativas.find(a => a.correta === true);
        const eCorreto = Boolean(escolheuId && correta && escolheuId === correta.id);

        if (eCorreto) totalAcertos++;

        if (escolheuId) {
            registrosParaGravar.push({
                questao_id: q.id,
                alternativa_escolhida_id: escolheuId,
                correto: eCorreto,
                tempo_resposta_segundos: 0,
                origem: 'simulado', // TAG DE REGISTRO
                sessao_id: sessaoId,
                questoes: {
                    disciplina_id: q.disciplinas?.id,
                    disciplinas: {
                        id: q.disciplinas?.id,
                        nome: q.disciplinas?.nome || 'Geral'
                    }
                }
            });
        }
    });

    try {
        const historicoLocal = JSON.parse(localStorage.getItem('alfa_desempenho_local') || '[]');
        localStorage.setItem('alfa_desempenho_local', JSON.stringify([...historicoLocal, ...registrosParaGravar]));
    } catch (e) {}

    if (client && registrosParaGravar.length > 0) {
        try {
            const ins = registrosParaGravar.map(r => ({
                questao_id: r.questao_id,
                alternativa_escolhida_id: r.alternativa_escolhida_id,
                correto: r.correto,
                tempo_resposta_segundos: 0,
                origem: 'simulado',
                sessao_id: sessaoId
            }));
            await client.from('desempenho').insert(ins);
        } catch (e) {}
    }

    const taxaAproveitamento = Math.round((totalAcertos / totalQuestao) * 100);

    const relatorioContainer = document.getElementById('container-relatorio-simulado');
    relatorioContainer.innerHTML = `
        <div class="card-questao" style="text-align: center;">
            <h3 style="font-size: 2.2rem; color: #1e3a8a; margin-bottom: 0.5rem;">Aproveitamento: ${taxaAproveitamento}%</h3>
            <p style="font-size: 1.1rem; color: #475569; margin-bottom: 1.5rem;">Acertou <strong>${totalAcertos}</strong> de <strong>${totalQuestao}</strong> questões neste simulado.</p>
            
            <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1.5rem; flex-wrap: wrap;">
                <a href="../index.html" class="btn btn-primario" style="background-color: #1e3a8a; color: #ffffff;">Ver no Dashboard Geral</a>
                <button class="btn btn-secundario" onclick="window.location.reload()">Novo Simulado</button>
            </div>
        </div>
    `;
}
