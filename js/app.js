// ============================================================
// PROJETO ALFA — LÓGICA DE CONEXÃO, NAVEGAÇÃO E DESEMPENHO
// ============================================================

// Credenciais públicas do Supabase (Projeto Alfa)
const SUPABASE_URL = 'https://maqnmxskvoccaxfoyojj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EgfPySKJgkJw4MFnT1Mt_A_ILc1IU8x';

// Inicialização do cliente Supabase via SDK CDN
const supabaseClient = window.supabase 
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
    : null;

// Estado global da questão e métricas do aluno
let questaoAtual = null;
let alternativaSelecionadaId = null;
let tempoInicio = null;
let questaoAnteriorId = null;

// Evento de carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('container-questao')) {
        carregarQuestaoAleatoria();
    }
});

// Busca uma questão na base de dados evitando repetição direta
async function carregarQuestaoAleatoria() {
    const container = document.getElementById('container-questao');
    if (!container) return;

    if (!supabaseClient) {
        container.innerHTML = `
            <div class="alerta erro">
                <h3>Erro de Inicialização</h3>
                <p>Não foi possível carregar a biblioteca do Supabase. Verifique a conexão com a internet.</p>
            </div>
        `;
        return;
    }

    // Reset de estado visual e de seleção
    questaoAtual = null;
    alternativaSelecionadaId = null;
    container.innerHTML = '<p class="carregando">Carregando questão do Supabase...</p>';

    try {
        // Consulta todas as questões com seus relacionamentos
        const { data: questoes, error } = await supabaseClient
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

        // Filtra para evitar repetir a mesma questão em sequência quando houver mais de uma
        let candidatas = questoes.filter(q => q.id !== questaoAnteriorId);
        if (candidatas.length === 0) candidatas = questoes;

        // Sorteia uma questão da lista
        const indiceSorteado = Math.floor(Math.random() * candidatas.length);
        questaoAtual = candidatas[indiceSorteado];
        questaoAnteriorId = questaoAtual.id;

        // Ordena as alternativas em ordem alfabética (A, B, C, D, E)
        if (questaoAtual.alternativas) {
            questaoAtual.alternativas.sort((a, b) => a.letra.localeCompare(b.letra));
        }

        renderizarQuestao(questaoAtual);

        // Marca o momento inicial para cronometrar a resolução
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

// Renderiza a estrutura visual da questão na tela
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

// Registra a alternativa selecionada pelo usuário
function selecionarAlternativa(id) {
    alternativaSelecionadaId = id;
    
    document.querySelectorAll('.opcao-alternativa').forEach(el => el.classList.remove('selecionada'));
    
    const label = document.getElementById(`label-alt-${id}`);
    if (label) label.classList.add('selecionada');

    const btn = document.getElementById('btn-responder');
    if (btn) btn.disabled = false;
}

// Avalia a resposta, registra o desempenho e ativa o botão de próxima questão
async function responderQuestao() {
    if (!questaoAtual || !alternativaSelecionadaId) return;

    const altSelecionada = questaoAtual.alternativas.find(a => a.id === alternativaSelecionadaId);
    const altCorreta = questaoAtual.alternativas.find(a => a.correta === true);
    const eCorreto = Boolean(altSelecionada?.correta);

    const tempoFim = Date.now();
    const tempoRespostaSegundos = tempoInicio ? Math.round((tempoFim - tempoInicio) / 1000) : 0;

    const feedbackDiv = document.getElementById('feedback-resposta');
    const boxResolucao = document.getElementById('box-resolucao');
    const btnResponder = document.getElementById('btn-responder');
    const btnProxima = document.getElementById('btn-proxima');

    // Desabilita as alternativas para travar o envio
    document.querySelectorAll('input[name="alternativa"]').forEach(input => input.disabled = true);
    if (btnResponder) {
        btnResponder.disabled = true;
        btnResponder.innerText = 'Gravando...';
    }

    // Grava a tentativa na tabela desempenho do Supabase
    try {
        const { error: erroGravacao } = await supabaseClient
            .from('desempenho')
            .insert([{
                questao_id: questaoAtual.id,
                alternativa_escolhida_id: alternativaSelecionadaId,
                correto: eCorreto,
                tempo_resposta_segundos: tempoRespostaSegundos
            }]);

        if (erroGravacao) {
            console.error('Erro ao gravar desempenho:', erroGravacao);
        } else {
            console.log('Desempenho salvo com sucesso no Supabase!');
        }
    } catch (err) {
        console.error('Erro inesperado ao salvar resposta:', err);
    } finally {
        if (btnResponder) btnResponder.innerText = 'Respondido';
        if (btnProxima) btnProxima.style.display = 'inline-block';
    }

    // Estilização das alternativas (Certo/Errado)
    document.querySelectorAll('.opcao-alternativa').forEach(el => {
        const altId = el.id.replace('label-alt-', '');
        if (altId === altCorreta?.id) {
            el.classList.add('correta');
        } else if (altId === alternativaSelecionadaId && !eCorreto) {
            el.classList.add('incorreta');
        }
    });

    // Exibe a mensagem de feedback
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

    // Revela a resolução comentada
    if (boxResolucao) {
        boxResolucao.style.display = 'block';
    }
}
