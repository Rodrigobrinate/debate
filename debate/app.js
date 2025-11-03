document.addEventListener('DOMContentLoaded', () => {
    // --- Seletores de Elementos ---
    
    // Token
    const apiKeyInput = document.getElementById('api-key');
    const saveTokenBtn = document.getElementById('save-token-btn');
    
    // Setup
    const agentCountInput = document.getElementById('agent-count');
    const iterationCountInput = document.getElementById('iteration-count');
    const setupAgentsBtn = document.getElementById('setup-agents-btn');
    const agentPersonalitiesDiv = document.getElementById('agent-personalities');
    const topicSetupDiv = document.getElementById('topic-setup');
    const debateTopicInput = document.getElementById('debate-topic');
    const startDebateBtn = document.getElementById('start-debate-btn');
    
    // Output
    const debateLog = document.getElementById('debate-log');
    const loadingSpinner = document.getElementById('loading-spinner');
    const statusMessage = document.getElementById('status-message');
    const errorDisplay = document.getElementById('error-display');

    // --- Constantes ---
    const API_KEY_STORAGE = 'gemini_api_key';
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=';

    // --- Event Listeners ---
    loadToken();
    saveTokenBtn.addEventListener('click', saveToken);
    setupAgentsBtn.addEventListener('click', setupAgentInputs);
    startDebateBtn.addEventListener('click', startDebate);

    // --- Lógica de Token ---
    function saveToken() {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem(API_KEY_STORAGE, apiKey);
            alert('Token salvo com sucesso!');
            apiKeyInput.placeholder = 'Token salvo no localStorage';
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

    // --- Lógica de Geração de API ---
    async function callGemini(apiKey, systemPrompt, instruction, history) {
        const systemInstruction = {
            role: "system",
            parts: [{ text: systemPrompt }]
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
                        "temperature": 0.8,
                        "topK": 1,
                        "topP": 1,
                        "maxOutputTokens": 1024,
                    }
                })
            });

            if (!response.ok) {
                const errorBody = await response.json();
                let errorMsg = errorBody.error ? errorBody.error.message : 'Erro desconhecido na API';
                if (errorBody.error && errorBody.error.status === 'INVALID_ARGUMENT') {
                    errorMsg = "API Key inválida ou mal formatada. Verifique seu Token.";
                }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
                return data.candidates[0].content.parts[0].text;
            } else {
                throw new Error('Resposta da API incompleta ou vazia.');
            }

        } catch (error) {
            console.error('Erro ao chamar o Gemini:', error);
            throw error;
        }
    }

    // --- Lógica de UI (Helpers) ---

    function setLoading(isLoading) {
        loadingSpinner.style.display = isLoading ? 'block' : 'none';
        startDebateBtn.disabled = isLoading;
        startDebateBtn.textContent = isLoading ? 'Debate em Andamento...' : 'Iniciar Debate';
    }

    function updateStatus(message) {
        statusMessage.textContent = message;
    }

    function showError(message) {
        if (message) {
            errorDisplay.textContent = message;
            errorDisplay.style.display = 'block';
        } else {
            errorDisplay.textContent = '';
            errorDisplay.style.display = 'none';
        }
    }

    function appendLog(agentName, message, agentIndex) {
        const logEntry = document.createElement('div');
        // Usa o módulo (%) para ciclar entre as 4 classes de cores definidas no CSS
        logEntry.className = `debate-turn agent-color-${agentIndex % 4}`;
        logEntry.innerHTML = `<strong>${agentName}:</strong><p>${message.replace(/\n/g, '<br>')}</p>`;
        debateLog.appendChild(logEntry);
        // Rola para a nova mensagem
        logEntry.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    // --- Lógica Principal ---

    // Passo 1: Gerar os campos de input para as personalidades
    function setupAgentInputs() {
        const agentCount = parseInt(agentCountInput.value, 10);
        
        if (agentCount < 2) {
            showError("Você precisa de pelo menos 2 agentes para um debate.");
            return;
        }
        
        showError(null); // Limpa erros
        agentPersonalitiesDiv.innerHTML = ''; // Limpa campos antigos

        for (let i = 0; i < agentCount; i++) {
            const div = document.createElement('div');
            div.className = 'agent-input-group';
            
            const label = document.createElement('label');
            label.textContent = `Personalidade do Agente ${i + 1}:`;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'agent-personality-input';
            input.placeholder = `Ex: 'Um cientista cético', 'Um empreendedor otimista'`;
            
            div.appendChild(label);
            div.appendChild(input);
            agentPersonalitiesDiv.appendChild(div);
        }

        // Mostra a seção do tópico do debate
        topicSetupDiv.style.display = 'block';
    }

    // Passo 2: Iniciar o debate
    async function startDebate() {
        showError(null);
        debateLog.innerHTML = '';
        
        // --- 1. Validação dos Inputs ---
        const apiKey = localStorage.getItem(API_KEY_STORAGE);
        if (!apiKey) {
            showError('Token (API Key) do Gemini não encontrado. Salve seu token primeiro.');
            return;
        }

        const iterationCount = parseInt(iterationCountInput.value, 10);
        const topic = debateTopicInput.value.trim();
        
        const personalityInputs = document.querySelectorAll('.agent-personality-input');
        const agentPersonalitiesList = Array.from(personalityInputs).map(input => input.value.trim());
        
        if (agentPersonalitiesList.length === 0 || agentPersonalitiesList.some(p => p === '')) {
            showError('Por favor, defina a personalidade de todos os agentes.');
            return;
        }
        if (!topic) {
            showError('Por favor, defina um tema para o debate.');
            return;
        }

        setLoading(true);

        // --- 2. Preparação dos Agentes ---
        const baseSystemPrompt = `Você é um debatedor em um debate. O tema é: "${topic}". 
Seja assertivo, mantenha seus argumentos concisos e responda diretamente ao debatedor anterior.`;
        
        const agents = agentPersonalitiesList.map((personality, index) => ({
            name: `Agente ${index + 1} (${personality.split(' ')[0]})`, // Nome curto, ex: "Agente 1 (Cientista)"
            index: index,
            systemPrompt: `${baseSystemPrompt}\nSUA PERSONALIDADE: ${personality}. Defenda esse ponto de vista.`
        }));

        let conversationHistory = []; // Formato: { role: 'user' | 'model', text: '...' }
        const agentCount = agents.length;
        let currentMessage = ""; // A mensagem do último debatedor

        // --- 3. O Loop do Debate ---
        try {
            for (let iter = 0; iter < iterationCount; iter++) {
                for (let agentIdx = 0; agentIdx < agentCount; agentIdx++) {
                    
                    const currentAgent = agents[agentIdx];
                    updateStatus(`Iteração ${iter + 1}/${iterationCount} - Vez de: ${currentAgent.name}`);

                    // A instrução (prompt) muda se for o primeiro turno ou não
                    let instruction;
                    if (iter === 0 && agentIdx === 0) {
                        instruction = `Você é o primeiro a falar. Comece o debate sobre o tema: "${topic}". Apresente seu argumento inicial.`;
                    } else {
                        instruction = `O debatedor anterior disse: "${currentMessage}". Responda a este argumento e defenda seu ponto de vista.`;
                    }
                    
                    // Chama a API
                    const response = await callGemini(apiKey, currentAgent.systemPrompt, instruction, conversationHistory);
                    
                    // Atualiza o estado
                    currentMessage = response; // Salva a resposta para o próximo agente
                    appendLog(currentAgent.name, response, currentAgent.index);
                    
                    // Adiciona ao histórico para contexto futuro
                    conversationHistory.push({ role: 'user', text: instruction });
                    conversationHistory.push({ role: 'model', text: response });
                }
            }
            updateStatus('Debate concluído.');
            
        } catch (error) {
            console.error("Falha no debate:", error);
            showError(`O debate falhou: ${error.message}`);
            updateStatus('Debate interrompido por um erro.');
        } finally {
            setLoading(false);
        }
    }
});
