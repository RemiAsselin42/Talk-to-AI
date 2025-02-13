class AIAssistant {
    constructor() {
        // Configuration initiale
        this.recognition = new webkitSpeechRecognition();
        this.synthesis = window.speechSynthesis;
        this.isRecording = false;
        this.volumeBar = document.querySelector('.volume-bar');
        this.voiceGender = 'female'; // Valeur par défaut : Julie

        // Récupérer la clé API du localStorage
        window.DEEPSEEK_API_KEY = localStorage.getItem('DEEPSEEK_API_KEY');

        // Variable pour accumuler la transcription
        this.fullTranscript = "";
        this.isSpeaking = false; // Nouvel état pour suivre si l'utilisateur parle
        this.textInput = null;
        this.sendButton = null;

        this.setupRecognition();
        this.setupAudioDevices();
    }

    setupRecognition() {
        this.recognition.continuous = true;
        this.recognition.lang = 'fr-FR';
        this.recognition.interimResults = true; // Activer les résultats intermédiaires

        // Log lors du démarrage de la reconnaissance
        this.recognition.onstart = () => {
            if (this.sendButton) this.sendButton.disabled = true;
        };

        // Log en cas d'erreur
        this.recognition.onerror = (event) => {
            console.error("Erreur complète de la reconnaissance vocale :", event);
            // Affichage détaillé dans la page, en évitant JSON.stringify si l'objet contient des références circulaires.
            this.addToConversation("Erreur de la reconnaissance vocale: " + event.error);
        };

        // Accumuler tous les résultats de transcription
        this.recognition.onresult = (event) => {
            const interimText = event.results[event.results.length - 1][0].transcript.trim();
            
            // Mettre à jour le champ texte en temps réel
            if (this.textInput) {
                this.textInput.value = interimText;
            }

            // Vérifier si le résultat est final
            if (event.results[event.results.length - 1].isFinal) {
                this.fullTranscript = interimText;
                
                // Si "merci" est détecté, traiter la demande
                if (interimText.toLowerCase().endsWith('merci')) {
                    if (this.sendButton) this.sendButton.disabled = false;
                    this.stopRecordingAndProcess();
                }
            }
        };

        this.recognition.onend = () => {
            if (this.sendButton) this.sendButton.disabled = false;
            this.isSpeaking = false;
        };
    }

    setupUI() {
        this.recordButton = document.getElementById('recordButton');
        this.recordButton.addEventListener('click', () => this.toggleRecording());

        this.attachToggleVoiceListener();

        // Initialiser l'icône du bouton de changement de voix
        const toggleVoiceButton = document.getElementById('toggle-voice-button');
        toggleVoiceButton.innerHTML = '<i class="fas fa-venus"></i>';

        // Ajout de la gestion de l'envoi de texte
        this.setupTextSubmission();

        // Faire une première requête à l'API pour une présentation rapide
        (async () => {
            const introductionText = "Présente-toi rapidement et précise qu'on peut t'écrire ou te parler, et dire merci quand on a terminé de parler pour envoyer la demande.";
            const response = await this.callDeepSeek(introductionText);
            this.addToConversation(response, 'assistant');
            this.speak(response);
        })();
    }

    setupTextSubmission() {
        this.textInput = document.getElementById('textInput');
        this.sendButton = document.getElementById('sendButton');

        if (!this.textInput || !this.sendButton) {
            console.error("Les éléments textInput ou sendButton ne sont pas trouvés.");
            return;
        }

        this.sendButton.addEventListener('click', async () => {
            if (this.isSpeaking) return; // Ignorer si en train de parler
            
            const text = this.textInput.value.trim();
            if (text) {
                this.addToConversation(text, 'user');
                try {
                    const response = await this.callDeepSeek(text);
                    this.addToConversation(response, 'assistant');
                    this.speak(response);
                    this.textInput.value = ''; // Vider le champ après l'envoi
                } catch (error) {
                    console.error("Erreur lors de l'envoi du texte :", error);
                    this.addToConversation("Erreur lors de l'envoi du texte.", 'assistant');
                }
            }
        });

        textInput.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Empêche le rechargement de la page
                sendButton.click(); // Simule un clic sur le bouton d'envoi
                textInput.value = ''; // Efface le texte après l'envoi
            }
        });
    }

    attachToggleVoiceListener() {
        const toggleVoiceButton = document.getElementById('toggle-voice-button');
        toggleVoiceButton.addEventListener('click', this.toggleVoice.bind(this));
    }

    async setupAudioDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();

            const inputSelect = document.getElementById('inputDevices');
            const outputSelect = document.getElementById('outputDevices');

            // Vider les listes existantes
            inputSelect.innerHTML = '';
            outputSelect.innerHTML = '';

            // Remplir les listes avec les périphériques disponibles
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Périphérique ${device.deviceId.slice(0, 5)}`;

                if (device.kind === 'audioinput') {
                    inputSelect.appendChild(option);
                } else if (device.kind === 'audiooutput') {
                    outputSelect.appendChild(option);
                }
            });

            this.setupUI();
        } catch (error) {
            this.addToConversation("Erreur lors de la configuration des périphériques audio :", error);
        }
    }

    async startRecognition() {
        const inputSelect = document.getElementById('inputDevices');
        const deviceId = inputSelect.value;

        // Réinitialiser la reconnaissance
        this.recognition = new webkitSpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.lang = 'fr-FR';
        this.setupRecognition();

        try {
            await this.recognition.start();
            return true;
        } catch (error) {
            this.addToConversation('Erreur au démarrage de la reconnaissance:', error);
            return false;
        }
    }

    async startMicrophoneAndAnalysis() {
        try {
            const deviceId = document.getElementById('inputDevices').value;
            const constraints = deviceId
                ? { audio: { deviceId: { exact: deviceId } } }
                : { audio: true };

            // Obtenir le flux audio
            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

            // Configurer l'analyseur audio
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);

            // Attendre que le niveau sonore soit suffisant avant de démarrer la reconnaissance
            await this.waitForSound();
            return true;
        } catch (error) {
            console.error('Erreur micro:', error);
            return false;
        }
    }

    async waitForSound() {
        return new Promise((resolve) => {
            const checkSound = () => {
                if (!this.analyser) return resolve();

                const bufferLength = this.analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                this.analyser.getByteFrequencyData(dataArray);

                // Calculer le niveau sonore moyen
                const average = dataArray.reduce((a, b) => a + b) / bufferLength;

                if (average > 35) { // Seuil de détection ajustable
                    resolve();
                } else {
                    requestAnimationFrame(checkSound);
                }
            };
            checkSound();
        });
    }

    updateVolumeMeter() {
        if (!this.analyser || !this.isRecording || !this.volumeBar) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        // Calculer une valeur moyenne du volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;

        // Facteur d'amplification pour augmenter la sensibilité
        const amplification = 5; // Vous pouvez ajuster ce facteur
        const adjustedVolume = average * amplification;

        // Mettre à jour l'affichage de la barre
        this.volumeBar.style.width = Math.min(adjustedVolume, 100) + '%';

        // Replanifier la mise à jour
        requestAnimationFrame(() => this.updateVolumeMeter());
    }

    stopMicrophoneAndAnalysis() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        const volumeBar = document.querySelector('.volume-bar');
        if (volumeBar) {
            volumeBar.style.width = '0%';
        }
    }

    async stopRecordingAndProcess() {
        // Arrêter la reconnaissance
        this.recognition.stop();

        // Envoyer la transcription à DeepSeek
        const textToProcess = this.textInput ? this.textInput.value.trim() : this.fullTranscript.trim();
        if (textToProcess) {
            const response = await this.callDeepSeek(textToProcess);
            this.addToConversation(response, 'assistant');
            this.speak(response);
        }

        // Réinitialiser
        this.fullTranscript = "";
        this.stopMicrophoneAndAnalysis();
        this.recordButton.innerHTML = '<i class="fas fa-microphone"></i>';
        this.recordButton.classList.remove('recording');
        this.isRecording = false;
        this.isSpeaking = false;
        
        if (this.sendButton) this.sendButton.disabled = false;
    }

    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecordingAndProcess();
        } else {
            try {
                this.recordButton.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                this.recordButton.classList.add('recording');
                this.isRecording = true;
                this.isSpeaking = true;
                
                if (this.textInput) this.textInput.value = ''; // Vider le champ au début
                if (this.sendButton) this.sendButton.disabled = true; // Désactiver le bouton

                const micStarted = await this.startMicrophoneAndAnalysis();
                if (micStarted) {
                    await this.recognition.start();
                } else {
                    this.handleRecordingError();
                }
            } catch (error) {
                this.handleRecordingError();
            }
        }
    }

    handleRecordingError() {
        this.isRecording = false;
        this.isSpeaking = false;
        this.recordButton.innerHTML = '<i class="fas fa-microphone"></i>';
        this.recordButton.classList.remove('recording');
        if (this.sendButton) this.sendButton.disabled = false;
        alert('Impossible de démarrer la reconnaissance vocale');
    }

    async callDeepSeek(text) {
        try {
            const apiKey = window.DEEPSEEK_API_KEY || localStorage.getItem('DEEPSEEK_API_KEY');
            console.log("Clé API DeepSeek :", apiKey);

            if (!apiKey) {
                console.error("La clé API DeepSeek n'est pas définie.");
                return "Désolé, la clé API n'est pas configurée.";
            }

            const systemPrompt = `Tu es un assistant virtuel français, serviable et amical. 
            Tu réponds toujours en français de manière claire et concise. 
            Si tu ne comprends pas quelque chose, n'hésite pas à demander des clarifications.
            Si on te pose une question technique, tu donnes des explications accessibles mais précises.
            N'utilise pas d'émojis et de langage familier ou vulgaire. Tu peux tutoyer les utilisateurs.
            Ta réponse passera par un text to speech pour être lue à l'utilisateur, fait donc une réponse faite pour être lu.
            Ainsi enlève les balises HTML, les retours à la ligne et les espaces inutiles, ainsi que les élémnents de mise en forme comme les * ou les #.
            `;

            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: text }
                    ]
                })
            });

            const data = await response.json();
            
            if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
                return data.choices[0].message.content;
            } else {
                console.error("Réponse inattendue de l'API DeepSeek :", data);
                return "Désolé, la réponse de l'API est invalide.";
            }
        } catch (error) {
            console.error("Erreur lors de l'appel à DeepSeek :", error);
            return "Désolé, une erreur s'est produite.";
        }
    }

    speak(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = this.synthesis.getVoices();
        let chosenVoice = null;

        if (this.voiceGender === 'female') {
            chosenVoice = voices.find(voice => voice.name === 'Microsoft Julie - French (France)');
        } else {
            chosenVoice = voices.find(voice => voice.name === 'Microsoft Paul - French (France)');
        }

        // Si la voix n'est pas trouvée, utiliser la première voix disponible
        if (!chosenVoice) {
            chosenVoice = voices[0];
        }

        utterance.voice = chosenVoice;
        utterance.lang = 'fr-FR';
        this.synthesis.speak(utterance);
    }

    toggleVoice() {
        // Bascule entre 'female' et 'male'
        this.voiceGender = this.voiceGender === 'female' ? 'male' : 'female';
        const toggleVoiceButton = document.getElementById('toggle-voice-button');
        // Mise à jour de l'icône
        toggleVoiceButton.innerHTML = this.voiceGender === 'female'
            ? '<i class="fas fa-venus"></i>'
            : '<i class="fas fa-mars"></i>';

        // Annonce vocale du changement de voix
        const announcement = this.voiceGender === 'female' ? "Voix féminine." : "Voix masculine.";
        this.speak(announcement);
    }

    addToConversation(text, role) {
        const conversation = document.getElementById('conversation');
        const bubble = document.createElement('div');
        bubble.textContent = text;
        conversation.appendChild(bubble);
        conversation.scrollTop = conversation.scrollHeight;
        if (role !== 'user') {
            bubble.className = `bubble assistant`;
        } else {
            bubble.className = `bubble user`;
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
    new AIAssistant();
});