document.addEventListener('DOMContentLoaded', () => {
    // Seletores de Elementos
    const apiKeyInput = document.getElementById('api-key');
    const saveTokenBtn = document.getElementById('save-token-btn');
    const startTrialBtn = document.getElementById('start-trial-btn');
    const caseDetailsInput = document.getElementById('case-details');
    const trialLog = document.getElementById('trial-log');
    const verdictOutput = document.getElementById('verdict-output');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    // NOVO: Seletores para status e erro
    const statusMessage = document.getElementById('status-message');
    const errorDisplay = document.getElementById('error-display');

    // Constantes
    const API_KEY_STORAGE = 'gemini_api_key';
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=';

    // Event Listeners
    loadToken();
    saveTokenBtn.addEventListener('click', saveToken);
    startTrialBtn.addEventListener('click', startTrial);

    function saveToken() {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem(API_KEY_STORAGE, apiKey);
            alert('Token salvo com sucesso!');
            location.reload();
        } else {
            alert('Por favor, insira um token.');
        }
    }

    function loadToken() {
        const apiKey = localStorage.getItem(API_KEY_STORAGE);
        if (apiKey) {
            apiKeyInput.value = apiKey;
            apiKeyInput.placeholder = 'Token salvo no localStorage';
        }
    }

    // Função principal da API (sem mudanças)
    async function callGemini(apiKey, rolePrompt, instruction, history) {
        const systemInstruction = {
            role: "system",
            parts: [{ text: rolePrompt }]
        };

        const formattedHistory = history.map(turn => ({
            role: turn.role,
            parts: [{ text: turn.text }]
        }));

        const userInstruction = {
            role: "user",
            parts: [{ text: instruction }]
        };

        try {
            const response = await fetch(API_URL + apiKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    "systemInstruction": systemInstruction,
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
                // NOVO: Tratamento de erro mais específico
                let errorMsg = `Erro na API: ${response.status}`;
                if (errorBody.error) {
                    errorMsg = errorBody.error.message;
                    if (errorBody.error.status === 'INVALID_ARGUMENT') {
                         errorMsg = "API Key inválida ou mal formatada. Verifique seu Token.";
                    } else if (errorBody.error.status === 'PERMISSION_DENIED') {
                        errorMsg = "A API Key foi recusada. Verifique se ela está correta e se a API Generative Language está ativa no seu projeto Google Cloud.";
                    }
                }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            
            if (data.candidates && data.candidates.length > 0) {
                if (data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
                    return data.candidates[0].content.parts[0].text;
                }
            }
            throw new Error('Resposta da API incompleta ou vazia.');

        } catch (error) {
            console.error('Erro ao chamar o Gemini:', error);
            throw error;
        }
    }

    // --- NOVAS FUNÇÕES DE UI ---

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

    // ATUALIZADA: Função setLoading
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

    // NOVO: Função para atualizar a mensagem de status
    function updateStatus(message) {
        statusMessage.textContent = message;
    }

    // NOVO: Função para exibir ou limpar erros
    function showError(message) {
        if (message) {
            errorDisplay.textContent = message;
            errorDisplay.style.display = 'block';
        } else {
            errorDisplay.textContent = '';
            errorDisplay.style.display = 'none';
        }
    }

    // --- LÓGICA DO JULGAMENTO (ATUALIZADA) ---

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

        // Limpar logs e erros anteriores
        trialLog.innerHTML = '';
        verdictOutput.innerHTML = '';
        showError(null); // NOVO: Limpa erros antigos
        setLoading(true);
        updateStatus('Iniciando simulação...'); // NOVO: Mensagem inicial

        let conversationHistory = [];
        const BASE_SYSTEM_PROMPT = `Você é um agente em uma simulação de julgamento criminal. Os fatos do caso são: "${caseDetails}". Atenha-se estritamente aos fatos fornecidos e ao seu papel. Seja profissional e use linguagem jurídica apropriada.`;
        const PROSECUTOR_PROMPT = `${BASE_SYSTEM_PROMPT}\nSeu papel: PROMOTORIA. Seu objetivo: Provar a culpa do réu.`;
        const DEFENSE_PROMPT = `${BASE_SYSTEM_PROMPT}\nSeu papel: ADVOGADO(A) DE DEFESA. Seu objetivo: Criar dúvida razoável ou provar a inocência do réu.`;
        const JUDGE_PROMPT = `${BASE_SYSTEM_PROMPT}\nSeu papel: JUIZ(A). Seu objetivo: Ser imparcial e entregar um veredito baseado SOMENTE nos argumentos.`;

        try {
            // --- FASE 1: DECLARAÇÕES INICIAIS ---
            updateStatus('FASE 1: Aguardando Declaração Inicial da Promotoria...');
            let prosecutorMsg = await callGemini(apiKey, PROSECUTOR_PROMPT, "Apresente sua declaração inicial.", conversationHistory);
            appendLog("Promotor", prosecutorMsg);
            conversationHistory.push({ role: 'model', text: `PROMOTOR: ${prosecutorMsg}` });

            updateStatus('FASE 1: Aguardando Declaração Inicial da Defesa...');
            let defenseMsg = await callGemini(apiKey, DEFENSE_PROMPT, `A promotoria fez sua declaração. Agora, apresente sua declaração inicial.`, conversationHistory);
            appendLog("Defesa", defenseMsg);
            conversationHistory.push({ role: 'model', text: `DEFESA: ${defenseMsg}` });

            // --- FASE 2: APRESENTAÇÃO DE ARGUMENTOS ---
            updateStatus('FASE 2: Aguardando 1º Argumento da Promotoria...');
            prosecutorMsg = await callGemini(apiKey, PROSECUTOR_PROMPT, "Apresente seu primeiro argumento principal.", conversationHistory);
            appendLog("Promotor", prosecutorMsg);
            conversationHistory.push({ role: 'model', text: `PROMOTOR: ${prosecutorMsg}` });

            updateStatus('FASE 2: Aguardando 1ª Refutação da Defesa...');
            defenseMsg = await callGemini(apiKey, DEFENSE_PROMPT, `A promotoria argumentou: "${prosecutorMsg}". Apresente sua contestação.`, conversationHistory);
            appendLog("Defesa", defenseMsg);
            conversationHistory.push({ role: 'model', text: `DEFESA: ${defenseMsg}` });

            // Round 2
            updateStatus('FASE 2: Aguardando 2º Argumento da Promotoria...');
            prosecutorMsg = await callGemini(apiKey, PROSECUTOR_PROMPT, `A defesa respondeu: "${defenseMsg}". Apresente sua réplica ou seu próximo argumento.`, conversationHistory);
            appendLog("Promotor", prosecutorMsg);
            conversationHistory.push({ role: 'model', text: `PROMOTOR: ${prosecutorMsg}` });

            updateStatus('FASE 2: Aguardando 2ª Refutação da Defesa...');
            defenseMsg = await callGemini(apiKey, DEFENSE_PROMPT, `A promotoria continuou: "${prosecutorMsg}". Apresente sua tréplica.`, conversationHistory);
            appendLog("Defesa", defenseMsg);
            conversationHistory.push({ role: 'model', text: `DEFESA: ${defenseMsg}` });
            
            // Round 3
            updateStatus('FASE 2: Aguardando 3º Argumento da Promotoria...');
            prosecutorMsg = await callGemini(apiKey, PROSECUTOR_PROMPT, `A defesa disse: "${defenseMsg}". Apresente seu argumento final ou evidência chave.`, conversationHistory);
            appendLog("Promotor", prosecutorMsg);
            conversationHistory.push({ role: 'model', text: `PROMOTOR: ${prosecutorMsg}` });

            updateStatus('FASE 2: Aguardando 3ª Refutação da Defesa...');
            defenseMsg = await callGemini(apiKey, DEFENSE_PROMPT, `A promotoria concluiu sua argumentação com: "${prosecutorMsg}". Apresente seu argumento final de refutação.`, conversationHistory);
            appendLog("Defesa", defenseMsg);
            conversationHistory.push({ role: 'model', text: `DEFESA: ${defenseMsg}` });

            // --- FASE 3: ALEGAÇÕES FINAIS ---
            updateStatus('FASE 3: Aguardando Alegações Finais da Promotoria...');
            prosecutorMsg = await callGemini(apiKey, PROSECUTOR_PROMPT, "Apresente suas alegações finais.", conversationHistory);
            appendLog("Promotor", prosecutorMsg);
            conversationHistory.push({ role: 'model', text: `PROMOTOR: ${prosecutorMsg}` });

            updateStatus('FASE 3: Aguardando Alegações Finais da Defesa...');
            defenseMsg = await callGemini(apiKey, DEFENSE_PROMPT, `A promotoria terminou. Apresente suas alegações finais.`, conversationHistory);
            appendLog("Defesa", defenseMsg);
            conversationHistory.push({ role: 'model', text: `DEFESA: ${defenseMsg}` });

            // --- FASE 4: VEREDITO ---
            updateStatus('FASE 4: O Juiz está deliberando o Veredito...');
            const verdict = await callGemini(apiKey, JUDGE_PROMPT, "Você ouviu todo o debate (registrado no histórico). Delibere e apresente seu veredito final, explicando seu raciocínio.", conversationHistory);
            appendVerdict(verdict);

            updateStatus('Julgamento Concluído.');

        } catch (error) {
            console.error("Erro durante o julgamento:", error);
            // NOVO: Exibe o erro na UI
            showError(`Falha na simulação: ${error.message}`);
            updateStatus('O julgamento foi interrompido por um erro.');
        } finally {
            // Limpa a mensagem de status e para o spinner
            setLoading(false);
            updateStatus(''); // Limpa a mensagem final
        }
    }
});
