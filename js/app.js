// ============================================================
// PROJETO ALFA — LÓGICA COMPLETA v8 (DASHBOARD, SIMULADO & CADERNO DE ERROS)
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
let chartGeralInstance = null;
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
// DASHBOARD DE DESEMPENHO E RENDERIZAÇÃO DE GRÁFICOS (index.html)
// ============================================================

async function carregarMetricasDashboard() {
    const elTotal = document.getElementById('stat-total');
    const elAcerto = document.getElementById('stat-acerto');
    const elTempo = document.getElementById('stat-tempo');
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
        if (elTotal) elTotal.innerText = '0';
        if (elAcerto) elAcerto.innerText = '0%';
        if (elTempo) elTempo.innerText = '0s';
        if (containerDisciplinas) {
            containerDisciplinas.innerHTML = `
                <div class="alerta aviso" style="grid-column: 1 / -1;">
                    <p>Nenhuma questão respondida ainda. Acesse o módulo de questões para começar a praticar!</p>
                </div>
            `;
        }
        return;
    }

    const total = registrosFinal.length;
    const acertos = registrosFinal.filter(r => r.correto === true || r.correto === 'true').length;
    const erros = total - acertos;
    const taxaAcerto = Math.round((acertos / total) * 100);

    const tempoTotal = registrosFinal.reduce((acc, r) => acc + (Number(r.tempo_resposta_segundos) || 0), 0);
    const tempoMedio = Math.round(tempoTotal / total);

    if (elTotal) elTotal.innerText = total;
    if (elAcerto) elAcerto.innerText = `${taxaAcerto}%`;
    if (elTempo) elTempo.innerText = `${tempoMedio}s`;

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

    renderizarGraficos(acertos, erros, estatisticasPorDisciplina);
}

function renderizarGraficos(acertos, erros, estatisticasDisciplinas) {
    if (typeof Chart === 'undefined') return;

    const ctxGeral = document.getElementById('chart-geral')?.getContext('2d');
    if (ctxGeral) {
        if (chartGeralInstance) chartGeralInstance.destroy();

        chartGeralInstance = new Chart(ctxGeral, {
            type: 'doughnut',
            data: {
                labels: ['Acertos', 'Erros'],
                datasets: [{
                    data: [acertos, erros],
                    backgroundColor: ['#16a34a', '#dc2626'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
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
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { callback: v => v + '%' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
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
        container.innerHTML = `
            <div class="alerta erro">
                <h3>Erro de Inicialização</h3>
                <p>Não foi possível ligar ao servidor.</p>
            </div>
        `;
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
            container.innerHTML = `
                <div class="alerta aviso">
                    <h3>Nenhuma questão encontrada</h3>
                    <p>Não existem questões cadastradas para os filtros selecionados.</p>
                </div>
            `;
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
            const mensagemStatus = statusFiltro === 'ineditas' 
                ? 'Já respondeu a todas as questões disponíveis nestes filtros!' 
                : 'Não existem questões incorretas no seu Caderno de Erros para os filtros selecionados.';

            container.innerHTML = `
                <div class="alerta aviso">
                    <h3>Sem questões disponíveis no status selecionado</h3>
                    <p>${mensagemStatus}</p>
                </div>
            `;
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
        console.error('Erro ao buscar questão:', err);
        container.innerHTML = `
            <div class="alerta erro">
                <p>Erro ao carregar questão: ${err.message}</p>
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
                <span id="cronometro-display" class="badge tempo">⏱️ 00:00</span>
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

    pararCronometro();

    const client = getSupabaseClient();
    const altSelecionada = questaoAtual.alternativas.find(a => a.id === alternativaSelecionadaId);
    const altCorreta = questaoAtual.alternativas.find(a => a.correta === true);
    const eCorreto = Boolean(altSelecionada?.correta);

    const tempoRespostaSegundos = segundosDecorridos;

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
        tempo_resposta_segundos: tempoRespostaSegundos,
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
    } catch (errLocal) {
        console.error('Erro local:', errLocal);
    }

    if (client) {
        try {
            await client
                .from('desempenho')
                .insert([{
                    questao_id: questaoAtual.id,
                    alternativa_escolhida_id: alternativaSelecionadaId,
                    correto: eCorreto,
                    tempo_resposta_segundos: tempoRespostaSegundos
                }]);
        } catch (err) {
            console.error('Erro no Supabase:', err);
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

    if (boxResolucao) boxResolucao.style.display = 'block';
}

// ============================================================
// MÓDULO DE MODO SIMULADO
// ============================================================

async function carregarFiltrosSimulado() {
    const select = document.getElementById('simulado-disciplina');
    if (!select) return;

    const client = getSupabaseClient();
    if (!client) return;

    try {
        const { data: disciplinas, error } = await client
            .from('disciplinas')
            .select('id, nome')
            .order('nome');

        if (error) throw error;

        select.innerHTML = '<option value="">Todas as Disciplinas</option>';
        if (disciplinas) {
            disciplinas.forEach(d => {
                select.innerHTML += `<option value="${d.id}">${d.nome}</option>`;
            });
        }
    } catch (e) {
        console.error('Erro ao carregar disciplinas no simulado:', e);
    }
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
        console.error('Erro ao iniciar simulado:', err);
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
    } catch (e) {
        console.error('Erro ao gravar simulado localmente:', e);
    }

    if (client && registrosParaGravar.length > 0) {
        try {
            const ins = registrosParaGravar.map(r => ({
                questao_id: r.questao_id,
                alternativa_escolhida_id: r.alternativa_escolhida_id,
                correto: r.correto,
                tempo_resposta_segundos: 0
            }));
            await client.from('desempenho').insert(ins);
        } catch (e) {
            console.error('Erro ao gravar simulado no Supabase:', e);
        }
    }

    const taxaAproveitamento = Math.round((totalAcertos / totalQuestao) * 100);

    const relatorioContainer = document.getElementById('container-relatorio-simulado');
    relatorioContainer.innerHTML = `
        <div class="card-questao" style="text-align: center;">
            <h3 style="font-size: 2rem; color: #1e3a8a; margin-bottom: 0.5rem;">Aproveitamento: ${taxaAproveitamento}%</h3>
            <p style="font-size: 1.1rem; color: #475569; margin-bottom: 1.5rem;">Acertou <strong>${totalAcertos}</strong> de <strong>${totalQuestao}</strong> questões do simulado.</p>
            
            <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1.5rem; flex-wrap: wrap;">
                <a href="../index.html" class="btn btn-primario" style="background-color: #1e3a8a; color: #ffffff;">Ver no Dashboard Geral</a>
                <button class="btn btn-secundario" onclick="window.location.reload()">Novo Simulado</button>
            </div>
        </div>
    `;
}
