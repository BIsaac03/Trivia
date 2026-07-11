import questions from "./static/questions.json" with { type: "json" }

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
        origin: "http://trivia-k294.onrender.com",
        //origin: "http://localhost:5500",
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
    questionNum: 0,
    powersToUse: {'50/50': false, '2nd selection': true, 'double pts': false},
    loadNextQuestion(question) {
        this.question = question.questionText;
        this.answer = question.answer;
        this.questionNum++;
    }
}

io.on("connection", (socket) => {
    socket.on("playerConnected", (ID) => {
        const returningPlayer = players.find(player => player.playerID == ID)
        if (returningPlayer == undefined){
            socket.emit("newConnection");
        }
        else{
            socket.emit("reconnection", gameState, players);
        }
    })

    socket.on("playerJoined", (name, ID, img) => {
        const existingPlayer = players.find(player => player.playerID == ID);
        if (existingPlayer == undefined){
            const newPlayer = makePlayer(name, ID, img);
            players.push(newPlayer) 
            socket.broadcast.emit("playerJoined", newPlayer);
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

    socket.on("attemptStart", () => {
        if (players.length > 1){
            gameState.gameHasStarted = true;
            io.emit("startTrivia");
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

        // all players have submitted their initial guess
        if (allPlayersAreReady()){
            for (let i = 0; i < players.length; i++){
                players[i].isReady = false;
            }
            const answers = compileAnswers();
            io.emit("sendAnswerChoices", answers);
        }
    })

    socket.on("choseFinalAnswer", (ID, guess) => {
        const player = players.find(player => player.playerID == ID);
        player.finalAnswer = guess;
        player.isReady = true;

        // all players have submitted their final answer
        if (allPlayersAreReady()){
            for (let i = 0; i < players.length; i++){
                players[i].isReady = false;
            }
            adjustPts();
        }
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
    let abilities = {'50/50': true, '2nd selection': true, 'double pts': true};
    let isReady = false;
    return {playerName, playerID, playerImg, initialGuess, finalAnswer, pts, abilities, isReady}
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
    io.emit("nextQuestion", gameState.question)
}

function compileAnswers(){
    const answers = []
    answers.push(gameState.answer);
    for (let i = 0; i < players.length; i++){
        answers.push(players[i].answer);
    }
    return answers.sort();
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
            if (players[j].finalAnswer == players[i].initialGuess){
                if (players[j].finalAnswer != players[j].initialGuess){
                    players[i].pts += FOOLPTS;
                }
            }
        }
        console.log(players[i].playerName, players[i].pts);
    }
}