const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const { fal } = require('@fal-ai/client');
const cors = require('cors');
const path = require('path'); // Neu: Für die Handhabung von Dateipfaden

// --- Konfiguration ---
const MODEL_ID = 'fal-ai/imagen4/preview/fast'; // Fal.ai Bildgenerierungsmodell
const NUM_IMAGES_PER_PLAYER = 3;

const PORT = process.env.PORT || 3000;
const PROMPT_TIME = 60; // Sekunden für die Prompt-Phase
const GENERATION_TIME = 5; // Simulierte Wartezeit nach der API-Antwort
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
app.use(cors()); // CORS für Express (statische Dateien) verwenden

// Stelle sicher, dass Express alle Dateien aus dem aktuellen Verzeichnis bereitstellt.
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);

// KORREKTUR: Socket.IO Initialisierung mit erweiterten CORS-Optionen
const io = socketio(server, {
    cors: {
        // Erlaubt die Verbindung von den Host-IPs (mit und ohne Port)
        // DIES BEHEBT DEN CORS-FEHLER!
        origin: [
            "http://10.30.27.254:3000",
            "http://10.30.27.254",
            "http://localhost:3000",
            "http://localhost"
        ],
        methods: ["GET", "POST"]
    }
});

// --- Spiellogik ---

// Die eigentliche Logik für die Bildgenerierung
async function generateImages(prompt) {
    if (!prompt) return [];
    console.log(`Starte Bildgenerierung für Prompt: "${prompt}"`);

    const result = await fal.imagine(
        MODEL_ID,
        {
            prompt: prompt,
            num_outputs: NUM_IMAGES_PER_PLAYER,
            seed: Math.floor(Math.random() * 10000)
        }
    );

    return result.images.map(img => img.url);
}

// Timer-Funktion für die Prompt-Phase
function startTimer() {
    battleState.timer = PROMPT_TIME;
    io.emit('stateUpdate', battleState); // Initiales Update

    timerInterval = setInterval(() => {
        battleState.timer--;
        io.emit('stateUpdate', battleState);

        if (battleState.timer <= 0) {
            clearInterval(timerInterval);
            handlePromtingEnd();
        }
    }, 1000);
}

// Behandelt das Ende der Prompt-Phase
async function handlePromtingEnd() {
    battleState.status = STATUS.GENERATING;
    io.emit('stateUpdate', battleState);
    console.log('Prompt-Phase beendet. Starte Generierung...');

    // Generiere Bilder parallel
    const [images1, images2] = await Promise.all([
        generateImages(battleState.prompt1),
        generateImages(battleState.prompt2)
    ]);

    battleState.images1 = images1;
    battleState.images2 = images2;
    battleState.status = STATUS.SELECTING;
    battleState.timer = GENERATION_TIME; // Timer wird für die Wartezeit missbraucht oder entfernt

    io.emit('stateUpdate', battleState);
    console.log('Bilder generiert. Starte Auswahlphase.');

    // In der SELECTING Phase läuft kein Timer, da die Spieler selbst bestätigen
    // Wenn Sie hier einen Timer wünschen, starten Sie ihn hier.
}

function startGame() {
    if (battleState.status === STATUS.READY) {
        // Setze Prompts und Auswahl zurück
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

    // Initialen Zustand senden
    socket.emit('stateUpdate', battleState);

    // Events vom Spielleiter (Publikum)
    socket.on('startGame', () => {
        startGame();
    });

    socket.on('resetGame', () => {
        if (battleState.status !== STATUS.READY) {
            clearInterval(timerInterval);
        }
        battleState.status = STATUS.READY;
        battleState.timer = PROMPT_TIME;

        // Alle Daten löschen
        battleState.prompt1 = '';
        battleState.prompt2 = '';
        battleState.images1 = [];
        battleState.images2 = [];
        battleState.selected1 = null;
        battleState.selected2 = null;

        io.emit('stateUpdate', battleState);
        console.log('Spiel zurückgesetzt.');
    });

    // Events von den Spielern
    socket.on('updatePrompt', (data) => {
        if (battleState.status !== STATUS.PROMPTING) return;

        if (data.playerId === 1) {
            battleState.prompt1 = data.prompt;
        } else if (data.playerId === 2) {
            battleState.prompt2 = data.prompt;
        }
        io.emit('stateUpdate', battleState); // Live-Update für das Publikum
    });

    socket.on('selectImage', (data) => {
        if (battleState.status !== STATUS.SELECTING) return;

        if (data.playerId === 1) {
            battleState.selected1 = data.imageId;
        } else if (data.playerId === 2) {
            battleState.selected2 = data.imageId;
        }
        io.emit('stateUpdate', battleState); // Update für alle

        // Prüfen, ob beide Spieler gewählt haben
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

server.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
    console.log(`Client-Zugriff unter http://10.30.27.254:${PORT}/index.html`);
});
