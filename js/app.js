// ============================================================
// PROJETO ALFA — LÓGICA DE CONEXÃO E NAVEGAÇÃO DE QUESTÕES
// ============================================================

// Credenciais públicas do Supabase (Projeto Alfa)
const SUPABASE_URL = 'https://maqnmxskvoccaxfoyojj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EgfPySKJgkJw4MFnT1Mt_A_ILc1IU8x';

// Inicialização do cliente Supabase
const supabaseClient = window.supabase 
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
    : null;

// Estado global da questão ativa
let questaoAtual = null;
let alternativaSelecionadaId = null;

// Evento de carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('container-questao')) {
        carregarPrimeiraQuestao();
    }
});

// Busca a questão cadastrada na base de dados
async function carregarPrimeiraQuestao() {
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

    container.innerHTML = '<p class="carregando">Carregando questão do Supabase...</p>';

    try {
        // Consulta relacional simplificada para obter a primeira questão cadastrada
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
            `)
            .order('criado_em', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (!questoes || questoes.length === 0) {
            container.innerHTML = `
                <div class="alerta aviso">
                    <h3>Nenhuma questão encontrada</h3>
                    <p>Execute o script de liberação de RLS no Supabase para permitir a leitura pública dos dados.</p>
                </div>
            `;
            return;
        }

        questaoAtual = questoes[0];
        
        // Ordena as alternativas por ordem alfabética (A, B, C, D, E)
        if (questaoAtual.alternativas) {
            questaoAtual.alternativas.sort((a, b) => a.letra.localeCompare(b.letra));
        }

        renderizarQuestao(questaoAtual);

    } catch (err) {
        console.error('Erro ao buscar questão:', err);
        container.innerHTML = `
            <div class="alerta erro">
                <p>Erro ao carregar a questão do Supabase: ${err.message}</p>
            </div>
        `;
    }
}

// Renderiza a estrutura da questão na tela
function renderizarQuestao(q) {
    const container = document.getElementById('container-questao');
    
    const disciplinaNome = q.disciplinas?.nome || 'Matemática Financeira';
    const assuntoNome = q.assuntos?.nome || 'Juros Simples';

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

// Avalia a resposta informada e exibe a resolução
function responderQuestao() {
    if (!questaoAtual || !alternativaSelecionadaId) return;

    const altSelecionada = questaoAtual.alternativas.find(a => a.id === alternativaSelecionadaId);
    const altCorreta = questaoAtual.alternativas.find(a => a.correta === true);

    const feedbackDiv = document.getElementById('feedback-resposta');
    const boxResolucao = document.getElementById('box-resolucao');
    const btnResponder = document.getElementById('btn-responder');

    document.querySelectorAll('input[name="alternativa"]').forEach(input => input.disabled = true);
    if (btnResponder) btnResponder.disabled = true;

    document.querySelectorAll('.opcao-alternativa').forEach(el => {
        const altId = el.id.replace('label-alt-', '');
        if (altId === altCorreta?.id) {
            el.classList.add('correta');
        } else if (altId === alternativaSelecionadaId && !altSelecionada?.correta) {
            el.classList.add('incorreta');
        }
    });

    if (altSelecionada && altSelecionada.correta) {
        feedbackDiv.innerHTML = `
            <div class="alerta sucesso">
                <strong>Parabéns! Resposta Correta.</strong> (Alternativa ${altSelecionada.letra})
            </div>
        `;
    } else {
        feedbackDiv.innerHTML = `
            <div class="alerta erro">
                <strong>Resposta Incorreta!</strong> A alternativa correta é a <strong>${altCorreta ? altCorreta.letra : 'C'}</strong>.
            </div>
        `;
    }

    if (boxResolucao) {
        boxResolucao.style.display = 'block';
    }
}
