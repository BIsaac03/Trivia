import questions from "./static/questions.json" with { type: "json" }

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Socket } from "dgram";

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
        origin: "http://localhost:5500",
    }
});

io.use((socket, next) => {
    next();
});

// point values for good guesses
const FIRSTTRYPTS = 5;
const SECONDGUESSPTS = 3;
const FOOLPTS = 1;

const players = [];
const gameState = {
    gameHasStarted: false,
    question: "",
    answer: "",
    allAnswers: [],
    questionNum: 0,
    abilitiesToUse: {eliminateOne: false, secondSelection: true, doublePts: false},
    loadNextQuestion(question) {
        this.question = question.questionText;
        this.answer = question.answer;
        this.questionNum++;
    }
}
let hostID = undefined;

io.on("connection", (socket) => {
    socket.on("userConnected", (ID) => {
        const returningPlayer = players.find(player => player.playerID == ID)
        if (hostID == undefined){
            hostID = ID;
            socket.emit("hostSetUp");
        }
        else if (returningPlayer == undefined && ID != hostID){
            socket.emit("newConnection");
        }
        else{
            socket.emit("reconnection", hostID, gameState, players);
        }
    })

    socket.on("playerJoined", (name, ID, img) => {
        const existingPlayer = players.find(player => player.playerID == ID);
        if (existingPlayer == undefined){
            const newPlayer = makePlayer(name, ID, img);
            players.push(newPlayer);
            socket.broadcast.emit("playerJoined", newPlayer, hostID);
            socket.emit("waitingInLobby", true);
        }
        else{
            existingPlayer.playerName = name;
            existingPlayer.playerImg = img;
            socket.broadcast.emit("playerModified", existingPlayer, hostID);
            socket.emit("waitingInLobby", false);
        }
    });

    socket.on("attemptStart", () => {
        if (players.length > 1){
            gameState.gameHasStarted = true;
            io.emit("startTrivia", players, hostID);
            io.emit("unreadyAllPlayers", hostID);
            sendNextQuesetion();
        }
        else{
            // !! send 'too few players' message
        }
    })
    
    socket.on("madeFirstGuess", (ID, guess) => {
        const player = players.find(player => player.playerID == ID);
        player.initialGuess = guess;
        player.isReady = true;
        io.emit("playerReady", ID, hostID);

        // all players have submitted their initial guess
        if (allPlayersAreReady()){
            for (let i = 0; i < players.length; i++){
                players[i].isReady = false;
            }
            io.emit("unreadyAllPlayers", hostID);
            const answers = compileAnswers();
            gameState.allAnswers = answers;
            io.emit("sendAnswerChoices", answers, hostID);
        }
    })

    socket.on("choseFinalAnswer", (ID, guessNum) => {
        const player = players.find(player => player.playerID == ID);
        player.finalAnswer = gameState.allAnswers[guessNum];
        player.isReady = true;
        io.emit("playerReady", player.playerID, hostID);

        // all players have submitted their final answer
        if (allPlayersAreReady()){
            for (let i = 0; i < players.length; i++){
                players[i].isReady = false;
                io.emit("unreadyAllPlayers", hostID);
            }
            io.emit("revealAnswer", players, gameState.answer, hostID);
            adjustPts();
        }
    })

    socket.on("finishedRound", () => {
        if (gameState.questionNum == questions.length){
            // !! end questions; display final scores on HOST
        }
        else{
            resetPlayers();
            gameState.allAnswers = [];
            io.emit("unreadyAllPlayers", hostID);
            sendNextQuesetion();
        }
    });

    socket.on("requestAbilities", (ID) => {
        const player = players.find(player => player.playerID = ID);
        socket.emit("displayAbilities", player.abilities, gameState.abilitiesToUse);
    });

    socket.on("useAbility", (abilityName, ID) => {
        // !! perform actions based on ability used
        // !! set player's ability to used
    });

    socket.on("requestSounds", (ID) => {
        const player = players.find(player => player.playerID = ID);
        socket.emit("displaySounds", player.sounds);
    });

    socket.on("playSound", (soundDescription, ID) => {
        // remove player's sound
        socket.emit("sendHostSound", soundDescription, hostID);
    })

    socket.on("test", (data) => {
        console.log(data);
    })
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
    let initialGuess = '';
    let finalAnswer = '';
    let pts = 0;
    let abilities = {eliminateOne: true, secondSelection: true, doublePts: true};
    let sounds = []; // [[soundName, numSounds], ...]
    let isReady = false;
    return {playerName, playerID, playerImg, initialGuess, finalAnswer, pts, abilities, sounds, isReady}
}

function allPlayersAreReady(){
    const waitingOnPlayer = players.find(player => player.isReady == false);
    if (waitingOnPlayer == undefined){
        return true;
    }
    else{ return false }
}

function sendNextQuesetion(){
    gameState.loadNextQuestion(questions[gameState.questionNum]);
    io.emit("nextQuestion", gameState.question, hostID)
}

function compileAnswers(){
    const answers = []
    answers.push(gameState.answer);
    for (let i = 0; i < players.length; i++){
        answers.push(players[i].initialGuess);
    }
    return [...new Set(answers.sort())];
}

function resetPlayers(){
    for (let i = 0; i < players.length; i++){
        players[i].initialGuess = "";
        players[i].finalAnswer = "";
        players[i].isReady = false;
    }
}

function adjustPts(){
    for (let i = 0; i < players.length; i++){
        if (players[i].initialGuess == gameState.answer){
            players[i].pts += FIRSTTRYPTS;
        }
        if (players[i].finalAnswer == gameState.answer){
            players[i].pts += SECONDGUESSPTS;
        }
        // award fooling points only if opponents pick "YOUR" answer 
        // no points if they pick their own answer, which happens to also be yours
        for (let j = 0; j < players.length; j++){
            if (players[j].finalAnswer == players[i].initialGuess && players[j].finalAnswer != gameState.answer){
                if (players[j].finalAnswer != players[j].initialGuess){
                    players[i].pts += FOOLPTS;
                }
            }
        }
        console.log(players[i].playerName, players[i].pts);
    }
}