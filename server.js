const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const { fal } = require('@fal-ai/client');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// --- Konfiguration aus Datei laden ---
let config;
try {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (error) {
    console.error("FEHLER: Konfigurationsdatei 'config.json' nicht gefunden oder ungültig.", error);
    process.exit(1);
}

// Werte aus der Config-Datei zuweisen
const IP_ADDRESS = config.server.ip;
const PORT = config.server.port || 3000;

// --- FAL.AI Konfiguration ---
// Die neuen Umgebungsvariablen werden automatisch von @fal-ai/client gelesen
// Stelle sicher, dass FAL_KEY_ID und FAL_KEY_SECRET gesetzt sind
if (!process.env.FAL_KEY_ID || !process.env.FAL_KEY_SECRET) {
    console.error("FEHLER: FAL_KEY_ID und FAL_KEY_SECRET Umgebungsvariablen müssen gesetzt sein!");
    console.error("Setze diese mit: export FAL_KEY_ID='dein_key_id' und export FAL_KEY_SECRET='dein_key_secret'");
    process.exit(1);
}

// --- Konstanten ---
const MODEL_ID = 'fal-ai/flux/schnell'; // Aktualisiertes Model (schnell und kosteneffizient)
const NUM_IMAGES_PER_PLAYER = 3;
const PROMPT_TIME = 60;
const GENERATION_TIME = 5;

const STATUS = {
    READY: 'READY',
    PROMPTING: 'PROMPTING',
    GENERATING: 'GENERATING',
    SELECTING: 'SELECTING',
    FINISHED: 'FINISHED'
};

let battleState = {
    status: STATUS.READY,
    timer: PROMPT_TIME,
    prompt1: '',
    prompt2: '',
    images1: [],
    images2: [],
    selected1: null,
    selected2: null
};

let timerInterval;

// --- Express/Socket.IO Initialisierung ---
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname)));

// Endpoint für Clients, um die Socket-URL zu erhalten
app.get('/config', (req, res) => {
    res.json({
        socketUrl: `http://${IP_ADDRESS}:${PORT}`
    });
});

const server = http.createServer(app);

// KORREKTUR: Socket.IO Initialisierung mit dynamischen Werten aus config.json
const io = socketio(server, {
    cors: {
        origin: [
            `http://${IP_ADDRESS}:${PORT}`, // Dynamisch aus Config
            `http://${IP_ADDRESS}`, // Dynamisch aus Config (ohne Port)
            `http://localhost:${PORT}`,
            "http://localhost"
        ],
        methods: ["GET", "POST"]
    }
});

// --- Spiellogik ---

/**
 * Generiert Bilder mit der aktualisierten fal.ai API
 * Verwendet jetzt fal.subscribe() statt fal.imagine()
 */
async function generateImages(prompt) {
    if (!prompt || prompt.trim() === '') {
        console.log('Leerer Prompt - überspringe Bildgenerierung');
        return [];
    }

    console.log(`Starte Bildgenerierung für Prompt: "${prompt}"`);

    try {
        // Verwende die aktualisierte API mit subscribe
        const result = await fal.subscribe(MODEL_ID, {
            input: {
                prompt: prompt,
                num_images: NUM_IMAGES_PER_PLAYER,
                image_size: "landscape_4_3", // Optional: Bildformat
                enable_safety_checker: false
            },
            logs: true,
            onQueueUpdate: (update) => {
                if (update.status === "IN_PROGRESS") {
                    console.log(`Generierung läuft... ${update.logs?.slice(-1)[0] || ''}`);
                }
            }
        });

        console.log('Bildgenerierung erfolgreich abgeschlossen');

        // Die Antwortstruktur überprüfen und Bild-URLs extrahieren
        if (result && result.data && result.data.images) {
            const imageUrls = result.data.images.map(img => img.url);
            console.log(`${imageUrls.length} Bilder generiert`);
            return imageUrls;
        } else if (result && result.images) {
            // Fallback für alternative Antwortstruktur
            const imageUrls = result.images.map(img => img.url);
            console.log(`${imageUrls.length} Bilder generiert`);
            return imageUrls;
        } else {
            console.error('Unerwartete Antwortstruktur:', JSON.stringify(result, null, 2));
            return [];
        }

    } catch (error) {
        console.error("Fehler bei der Bildgenerierung:", error);
        console.error("Fehlerdetails:", error.message);
        if (error.body) {
            console.error("API Fehlerbody:", JSON.stringify(error.body, null, 2));
        }
        return [];
    }
}

function startTimer() {
    battleState.timer = PROMPT_TIME;
    io.emit('stateUpdate', battleState);

    timerInterval = setInterval(() => {
        battleState.timer--;
        io.emit('stateUpdate', battleState);

        if (battleState.timer <= 0) {
            clearInterval(timerInterval);
            handlePromptingEnd();
        }
    }, 1000);
}

async function handlePromptingEnd() {
    battleState.status = STATUS.GENERATING;
    io.emit('stateUpdate', battleState);
    console.log('Prompt-Phase beendet. Starte Generierung...');

    try {
        // Generiere Bilder für beide Spieler parallel
        const [images1, images2] = await Promise.all([
            generateImages(battleState.prompt1),
            generateImages(battleState.prompt2)
        ]);

        battleState.images1 = images1;
        battleState.images2 = images2;
        battleState.status = STATUS.SELECTING;
        battleState.timer = 0;

        io.emit('stateUpdate', battleState);
        console.log(`Bilder generiert. Spieler 1: ${images1.length}, Spieler 2: ${images2.length}. Starte Auswahlphase.`);
    } catch (error) {
        console.error('Fehler beim Generieren der Bilder:', error);
        // Im Fehlerfall zurück zu READY
        battleState.status = STATUS.READY;
        battleState.timer = PROMPT_TIME;
        io.emit('stateUpdate', battleState);
    }
}

function startGame() {
    if (battleState.status === STATUS.READY) {
        battleState.prompt1 = '';
        battleState.prompt2 = '';
        battleState.selected1 = null;
        battleState.selected2 = null;
        battleState.images1 = [];
        battleState.images2 = [];
        battleState.status = STATUS.PROMPTING;

        console.log('Spiel gestartet. Prompting-Phase beginnt.');
        startTimer();
    }
}

// --- Socket.IO Verbindungs- und Event-Handling ---
io.on('connection', (socket) => {
    console.log('Neuer Client verbunden:', socket.id);
    socket.emit('stateUpdate', battleState);

    socket.on('startGame', () => {
        startGame();
    });

    socket.on('resetGame', () => {
        if (battleState.status !== STATUS.READY) {
            clearInterval(timerInterval);
        }

        battleState.status = STATUS.READY;
        battleState.timer = PROMPT_TIME;
        battleState.prompt1 = '';
        battleState.prompt2 = '';
        battleState.images1 = [];
        battleState.images2 = [];
        battleState.selected1 = null;
        battleState.selected2 = null;

        io.emit('stateUpdate', battleState);
        console.log('Spiel zurückgesetzt.');
    });

    socket.on('updatePrompt', (data) => {
        if (battleState.status !== STATUS.PROMPTING) return;

        if (data.playerId === 1) {
            battleState.prompt1 = data.prompt;
        } else if (data.playerId === 2) {
            battleState.prompt2 = data.prompt;
        }

        io.emit('stateUpdate', battleState);
    });

    socket.on('selectImage', (data) => {
        if (battleState.status !== STATUS.SELECTING) return;

        if (data.playerId === 1) {
            battleState.selected1 = data.imageId;
        } else if (data.playerId === 2) {
            battleState.selected2 = data.imageId;
        }

        io.emit('stateUpdate', battleState);

        if (battleState.selected1 !== null && battleState.selected2 !== null) {
            battleState.status = STATUS.FINISHED;
            io.emit('stateUpdate', battleState);
            console.log('Beide Spieler haben gewählt. Spiel beendet.');
        }
    });

    socket.on('disconnect', () => {
        console.log('Client getrennt:', socket.id);
    });
});

// --- Server starten ---
// Hier verwenden wir nun die Variablen aus der Config!
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server läuft auf http://${IP_ADDRESS}:${PORT}`);
    console.log(`Client-Zugriff unter http://${IP_ADDRESS}:${PORT}/index.html`);
    console.log(`FAL Model: ${MODEL_ID}`);
    console.log(`FAL_KEY_ID gesetzt: ${process.env.FAL_KEY_ID ? 'Ja' : 'Nein'}`);
    console.log(`FAL_KEY_SECRET gesetzt: ${process.env.FAL_KEY_SECRET ? 'Ja (versteckt)' : 'Nein'}`);
});
