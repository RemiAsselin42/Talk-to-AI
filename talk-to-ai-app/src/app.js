class AIAssistant {
    constructor() {
        // Configuration initiale
        this.recognition = new webkitSpeechRecognition();
        this.synthesis = window.speechSynthesis;
        this.isRecording = false;
        this.volumeBar = document.querySelector('.volume-bar');

        // Variable pour accumuler la transcription
        this.fullTranscript = "";

        this.setupRecognition();
        this.setupUI();
        this.setupAudioDevices();
    }

    setupRecognition() {
        this.addToConversation("Configuration de la reconnaissance vocale...");

        this.recognition.continuous = true;
        this.recognition.lang = 'fr-FR';

        // Log lors du démarrage de la reconnaissance
        this.recognition.onstart = () => {
            this.addToConversation("La reconnaissance vocale a démarré.");
        };

        // Log en cas d'erreur
        this.recognition.onerror = (event) => {
            console.error("Erreur complète de la reconnaissance vocale :", event);
            // Affichage détaillé dans la page, en évitant JSON.stringify si l'objet contient des références circulaires.
            this.addToConversation("Erreur de la reconnaissance vocale: " + event.error);
        };

        // Accumuler tous les résultats de transcription
        this.recognition.onresult = (event) => {
            console.log("Résultat reçu :", event);
            const interimText = event.results[event.results.length - 1][0].transcript.trim();
            console.log("Texte reconnu :", interimText);
            // Ajoute le texte reconnu à la transcription complète
            this.fullTranscript += interimText + " ";
            // Afficher le résultat partiel
            this.addToConversation('Vous: ' + interimText, 'user');
        };
    }

    setupUI() {
        this.recordButton = document.getElementById('recordButton');
        this.recordButton.addEventListener('click', () => this.toggleRecording());
    }

    async setupAudioDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.addToConversation("Liste des périphériques audio disponibles :", devices);

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
            // Démarrer avec le périphérique sélectionné
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
            this.addToConversation("Flux audio obtenu :", this.mediaStream);

            // Configurer l'analyseur audio
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);

            // Démarrer l'analyse du volume
            this.updateVolumeMeter();
            return true;
        } catch (error) {
            console.error('Erreur micro:', error);
            return false;
        }
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

    async toggleRecording() {
        if (this.isRecording) {
            // Arrêter la reconnaissance
            this.recognition.stop();
            this.addToConversation("Arrêt de la reconnaissance vocale.");

            // Envoyer la transcription complète à DeepSeek
            const completeText = this.fullTranscript.trim();
            if (completeText) {
                const response = await this.callDeepSeek(completeText);
                this.addToConversation('Assistant: ' + response, 'assistant');
                this.speak(response);
            }

            // Réinitialiser la transcription pour la prochaine session
            this.fullTranscript = "";

            this.stopMicrophoneAndAnalysis();
            this.recordButton.innerHTML = '<i class="fas fa-microphone"></i>';
            this.recordButton.classList.remove('recording');
            this.isRecording = false;
        } else {
            try {
                const micStarted = await this.startMicrophoneAndAnalysis();
                if (micStarted) {
                    await this.recognition.start();
                    this.addToConversation("Démarrage de la reconnaissance vocale...");
                    this.recordButton.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                    this.recordButton.classList.add('recording');
                    this.isRecording = true;
                } else {
                    alert('Impossible d\'accéder au microphone');
                }
            } catch (error) {
                console.error('Erreur au démarrage:', error);
                alert('Impossible de démarrer la reconnaissance vocale');
            }
        }
    }

    async callDeepSeek(text) {
        try {
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [{
                        role: "user",
                        content: text
                    }]
                })
            });
            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error("Erreur lors de l'appel à DeepSeek :", error);
            return "Désolé, une erreur s'est produite.";
        }
    }

    speak(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'fr-FR';
        this.synthesis.speak(utterance);
    }

    addToConversation(text, role) {
        const conversation = document.getElementById('conversation');
        const bubble = document.createElement('div');
        bubble.className = `bubble ${role}`;
        bubble.textContent = text;
        conversation.appendChild(bubble);
        conversation.scrollTop = conversation.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AIAssistant();
});