import questions from "./static/questions.json" assert { type: "json" }

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/////// SOCKETIO SETUP
const app = express();
const httpServer = createServer(app);
const port = process.env.PORT || 3000 ;

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/static/client.js');
});
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/static/styles.css');
});

app.use("/static", express.static('./static/'));

const io = new Server(httpServer, {
    cors: {
        //origin: "http://trivia-k294.onrender.com",
        origin: "http://localhost:5501",
    }
});

io.use((socket, next) => {
    next();
});

const players = [];

io.on("connection", (socket) => {
    socket.on("playerJoined", (name, ID, img) => {
        const existingPlayer = players.find(player => player.playerID == ID);
        if (existingPlayer == undefined){
            const newPlayer = makePlayer(name, ID, img);
            players.push(newPlayer) 
            socket.broadcast.emit("playerJoined", newPlayer);
            // console.log(players[0]);
        }
        else{
            existingPlayer.playerName = name;
            existingPlayer.playerImg = img;
            socket.broadcast.emit("playerModified", existingPlayer);
        }
    });

    socket.on("waitingInLobby", () => {
        socket.emit("displayLobby", players);
    })
    
    //io.emit("sendQuestion", questions[0].questionText);
});

httpServer.listen(port, function () {
    var host = httpServer.address().address
    var port = httpServer.address().port
    console.log('App listening at https://%s:%s', host, port)
});

function makePlayer(name, ID, img){
    let playerName = name;
    const playerID = ID;
    let playerImg = img;
    let firstGuess = '';
    let finalSelection = '';
    let pts = 0;
    let abilities = {'50/50': true, '2nd selection': true, 'double pts': true};
    return {playerName, playerID, playerImg, firstGuess, finalSelection, pts, abilities}
}