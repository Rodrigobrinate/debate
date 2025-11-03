document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('api-key');
    const saveTokenBtn = document.getElementById('save-token-btn');
    const startTrialBtn = document.getElementById('start-trial-btn');
    const caseDetailsInput = document.getElementById('case-details');
    const trialLog = document.getElementById('trial-log');
    const verdictOutput = document.getElementById('verdict-output');
    const loadingSpinner = document.getElementById('loading-spinner');

    const API_KEY_STORAGE = 'gemini_api_key';
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=';

    // Carregar a chave de API do localStorage ao iniciar
    loadToken();

    saveTokenBtn.addEventListener('click', saveToken);
    startTrialBtn.addEventListener('click', startTrial);

    function saveToken() {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem(API_KEY_STORAGE, apiKey);
            alert('Token salvo com sucesso!');
            // Recarrega para "limpar" o campo de senha
            location.reload();
        } else {
            alert('Por favor, insira um token.');
        }
    }

    function loadToken() {
        const apiKey = localStorage.getItem(API_KEY_STORAGE);
        if (apiKey) {
            apiKeyInput.value = apiKey; // Coloca a chave no campo
            apiKeyInput.placeholder = 'Token salvo no localStorage';
        }
    }

    // Função principal para chamar a API do Gemini
    async function callGemini(apiKey, rolePrompt, instruction, history) {
        // O `system` é a instrução de nível superior que define o "personagem"
        const systemInstruction = {
            role: "system",
            parts: [{ text: rolePrompt }]
        };

        // Formata o histórico para a API
        // O histórico alterna entre 'user' (o controlador) e 'model' (o agente)
        const contents = [];
        
        // Adiciona a instrução do sistema (personalidade)
        // Nota: A API v1beta prefere isso dentro de `contents`
        // Para uma conversa "pura", o primeiro item do history seria o system.
        // Vamos formatar o histórico para incluir a personalidade do agente atual.
        
        const formattedHistory = history.map(turn => ({
            role: turn.role,
            parts: [{ text: turn.text }]
        }));

        // A `instruction` é o prompt do "usuário" para o agente
        const userInstruction = {
            role: "user",
            parts: [{ text: instruction }]
        };

        try {
            const response = await fetch(API_URL + apiKey, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    // O `systemInstruction` define o comportamento do 'model'
                    "systemInstruction": systemInstruction, 
                    // `contents` é o histórico da conversa + o novo prompt
                    "contents": [...formattedHistory, userInstruction], 
                    "generationConfig": {
                        "temperature": 0.7,
                        "topK": 1,
                        "topP": 1,
                        "maxOutputTokens": 1024,
                    }
                })
            });

            if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(`Erro na API: ${response.status} - ${errorBody.error.message}`);
            }

            const data = await response.json();
            
            if (data.candidates && data.candidates.length > 0) {
                 // Verifica se 'parts' existe e tem conteúdo
                if (data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
                    return data.candidates[0].content.parts[0].text;
                }
            }
            // Fallback se a resposta não tiver o conteúdo esperado
            throw new Error('Resposta da API incompleta ou vazia.');

        } catch (error) {
            console.error('Erro ao chamar o Gemini:', error);
            throw error; // Propaga o erro para ser pego pelo `startTrial`
        }
    }

    // Função para atualizar a interface
    function appendLog(role, message) {
        const roleClass = role === "Promotor" ? "prosecutor" : "defense";
        const argumentDiv = document.createElement('div');
        argumentDiv.className = `argument ${roleClass}`;
        argumentDiv.innerHTML = `<strong>${role}:</strong><p>${message.replace(/\n/g, '<br>')}</p>`;
        trialLog.appendChild(argumentDiv);
    }

    function appendVerdict(message) {
        verdictOutput.innerHTML = `<p>${message.replace(/\n/g, '<br>')}</p>`;
    }

    function setLoading(isLoading) {
        if (isLoading) {
            loadingSpinner.style.display = 'block';
            startTrialBtn.disabled = true;
            startTrialBtn.textContent = 'Julgamento em Andamento...';
        } else {
            loadingSpinner.style.display = 'none';
            startTrialBtn.disabled = false;
            startTrialBtn.textContent = 'Iniciar Julgamento';
        }
    }

    // A LÓGICA DO JULGAMENTO
    async function startTrial() {
        const apiKey = localStorage.getItem(API_KEY_STORAGE);
        const caseDetails = caseDetailsInput.value.trim();

        if (!apiKey) {
            alert('Por favor, salve seu Token (API Key) do Gemini primeiro.');
            return;
        }

        if (!caseDetails) {
            alert('Por favor, descreva os fatos do caso.');
            return;
        }

        // Limpar logs anteriores
        trialLog.innerHTML = '';
        verdictOutput.innerHTML = '';
        setLoading(true);

        // Histórico da conversa (para dar contexto aos agentes)
        // Formato: { role: 'user' | 'model', text: '...' }
        let conversationHistory = [];

        // Definição dos Agentes (Prompts de Sistema)
        const BASE_SYSTEM_PROMPT = `Você é um agente em uma simulação de julgamento criminal. 
Os fatos do caso são: "${caseDetails}".
Atenha-se estritamente aos fatos fornecidos e ao seu papel. Seja profissional e use linguagem jurídica apropriada.`;

        const PROSECUTOR_PROMPT = `${BASE_SYSTEM_PROMPT}
Seu papel: PROMOTORIA.
Seu objetivo: Provar a culpa do réu além de qualquer dúvida razoável, usando os fatos disponíveis.`;

        const DEFENSE_PROMPT = `${BASE_SYSTEM_PROMPT}
Seu papel: ADVOGADO(A) DE DEFESA.
Seu objetivo: Criar dúvida razoável ou provar a inocência do réu, usando os fatos disponíveis e contestando a promotoria.`;

        const JUDGE_PROMPT = `${BASE_SYSTEM_PROMPT}
Seu papel: JUIZ(A).
Seu objetivo: Ser imparcial, ouvir ambos os lados e, ao final, entregar um veredito baseado SOMENTE nos argumentos apresentados e nos fatos do caso.`;

        try {
            // --- FASE 1: DECLARAÇÕES INICIAIS ---
            appendLog("Juiz (Sistema)", "O tribunal está em sessão. A promotoria pode começar com sua declaração inicial.");

            let prosecutorMsg = await callGemini(apiKey, PROSECUTOR_PROMPT, "Apresente sua declaração inicial, resumindo o que você pretende provar.", conversationHistory);
            appendLog("Promotor", prosecutorMsg);
            conversationHistory.push({ role: 'model', text: `PROMOTOR: ${prosecutorMsg}` }); // O agente é o 'model'

            let defenseMsg = await callGemini(apiKey, DEFENSE_PROMPT, `A promotoria fez sua declaração. Agora, apresente sua declaração inicial, resumindo sua linha de defesa.`, conversationHistory);
            appendLog("Defesa", defenseMsg);
            conversationHistory.push({ role: 'model', text: `DEFESA: ${defenseMsg}` }); // O agente é o 'model'

            // --- FASE 2: APRESENTAÇÃO DE ARGUMENTOS (O "LOOP") ---
            appendLog("Juiz (Sistema)", "As declarações iniciais foram concluídas. A promotoria pode chamar sua primeira testemunha ou apresentar seu primeiro argumento principal.");

            // Round 1
            prosecutorMsg = await callGemini(apiKey, PROSECUTOR_PROMPT, "Apresente seu primeiro argumento principal, evidência ou resumo de testemunho.", conversationHistory);
            appendLog("Promotor", prosecutorMsg);
            conversationHistory.push({ role: 'model', text: `PROMOTOR: ${prosecutorMsg}` });

            defenseMsg = await callGemini(apiKey, DEFENSE_PROMPT, `A promotoria argumentou: "${prosecutorMsg}". Apresente sua contestação (cross-examination) ou argumento de refutação.`, conversationHistory);
            appendLog("Defesa", defenseMsg);
            conversationHistory.push({ role: 'model', text: `DEFESA: ${defenseMsg}` });

            // Round 2 (Réplica e Tréplica)
            prosecutorMsg = await callGemini(apiKey, PROSECUTOR_PROMPT, `A defesa respondeu: "${defenseMsg}". Apresente sua réplica ou seu próximo argumento.`, conversationHistory);
            appendLog("Promotor", prosecutorMsg);
            conversationHistory.push({ role: 'model', text: `PROMOTOR: ${prosecutorMsg}` });

            defenseMsg = await callGemini(apiKey, DEFENSE_PROMPT, `A promotoria continuou: "${prosecutorMsg}". Apresente sua tréplica ou sua próxima linha de defesa.`, conversationHistory);
            appendLog("Defesa", defenseMsg);
            conversationHistory.push({ role: 'model', text: `DEFESA: ${defenseMsg}` });
            
            // Round 3 (Mais argumentos para "bastante argumentos")
            prosecutorMsg = await callGemini(apiKey, PROSECUTOR_PROMPT, `A defesa disse: "${defenseMsg}". Apresente seu argumento final ou evidência chave.`, conversationHistory);
            appendLog("Promotor", prosecutorMsg);
            conversationHistory.push({ role: 'model', text: `PROMOTOR: ${prosecutorMsg}` });

            defenseMsg = await callGemini(apiKey, DEFENSE_PROMPT, `A promotoria concluiu sua argumentação com: "${prosecutorMsg}". Apresente seu argumento final de refutação.`, conversationHistory);
            appendLog("Defesa", defenseMsg);
            conversationHistory.push({ role: 'model', text: `DEFESA: ${defenseMsg}` });


            // --- FASE 3: ALEGAÇÕES FINAIS ---
            appendLog("Juiz (Sistema)", "Ambos os lados apresentaram seus argumentos. Passamos às alegações finais. Promotoria, por favor.");

            prosecutorMsg = await callGemini(apiKey, PROSECUTOR_PROMPT, "Apresente suas alegações finais. Resuma seu caso e por que o réu deve ser considerado culpado.", conversationHistory);
            appendLog("Promotor", prosecutorMsg);
            conversationHistory.push({ role: 'model', text: `PROMOTOR: ${prosecutorMsg}` });

            defenseMsg = await callGemini(apiKey, DEFENSE_PROMPT, `A promotoria terminou. Apresente suas alegações finais. Resuma seu caso e por que o réu deve ser considerado inocente ou por que existe dúvida razoável.`, conversationHistory);
            appendLog("Defesa", defenseMsg);
            conversationHistory.push({ role: 'model', text: `DEFESA: ${defenseMsg}` });

            // --- FASE 4: VEREDITO ---
            appendLog("Juiz (Sistema)", "As alegações finais foram concluídas. O tribunal irá deliberar. O Juiz apresentará o veredito.");

            const verdict = await callGemini(apiKey, JUDGE_PROMPT, "Você ouviu todo o debate (registrado no histórico) e revisou os fatos iniciais do caso. Delibere e apresente seu veredito final. Explique seu raciocínio claramente, citando os argumentos que o convenceram.", conversationHistory);
            appendVerdict(verdict);

        } catch (error) {
            console.error("Erro durante o julgamento:", error);
            appendLog("ERRO DO SISTEMA", error.message);
        } finally {
            setLoading(false);
        }
    }
});
