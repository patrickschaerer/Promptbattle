const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.io Setup mit CORS-Freigabe für alle Ursprünge
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Statische Dateien aus dem "www" Ordner servieren
app.use(express.static(path.join(__dirname, 'www')));

// Standard-Route für die Admin-Oberfläche
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

// Socket.io Logik
io.on('connection', (socket) => {
    console.log('Ein Benutzer hat sich verbunden:', socket.id);

    // Wenn ein Spieler einen Prompt sendet
    socket.on('send-prompt', (data) => {
        console.log('Prompt empfangen:', data);
        // Wir senden den Prompt und den API-Key an alle verbundenen Clients (Laptops) weiter
        io.emit('new-image-request', {
            prompt: data.prompt,
            apiKey: data.apiKey,
            playerName: data.playerName
        });
    });

    socket.on('disconnect', () => {
        console.log('Benutzer getrennt:', socket.id);
    });
});

// WICHTIG: Port-Konfiguration für Cloud-Hoster
// Koyeb vergibt den Port automatisch über die Umgebungsvariable PORT
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 Promptbattle Server läuft!`);
    console.log(`🌍 Port: ${PORT}`);
    console.log(`-----------------------------------------`);
});
