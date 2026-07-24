import questions from "./static/questions.json" with { type: "json" }

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Socket } from "dgram";
import e from "express";
import { secureHeapUsed } from "crypto";

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
    totalQuestions: questions.length,
    abilitiesToUse: {eliminateOne: true, secondSelection: true, doublePts: false, seeAllSubmissions: false},
    loadNextQuestion(question) {
        this.question = question.questionText;
        this.answer = question.answer;
        this.questionNum++;
    },
    updateAvailableAbilities(){
        // !! add round availability for each ability
        if (this.questionNum > 1){
            this.abilitiesToUse.doublePts = true;
        }
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
            const nameInUse = players.find(player => player.playerName == name);
            if (nameInUse == undefined){
                const newPlayer = makePlayer(name, ID, img);
                players.push(newPlayer);
                socket.broadcast.emit("playerJoined", newPlayer, hostID);
                socket.emit("waitingInLobby", true);
            }
            else{
                socket.emit("nameInUse", name);
            }
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
            io.emit("startTrivia", players, gameState, hostID);
            io.emit("unreadyAllPlayers", hostID);
            sendNextQuesetion();
        }
        else{
            // !! send 'too few players' message
        }
    })
    
    socket.on("madeFirstGuess", (ID, guess) => {
        const player = players.find(player => player.playerID == ID);
        if (player == undefined){
            console.log("undefined player; signal from previous session")
        }
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
        const player = players.find(player => player.playerID = ID);

        // ensure all users have submitted initial guesses
        if (gameState.allAnswers.length == 0){
            socket.emit("illegalAbilityUse");
        }

        else if (gameState.abilitiesToUse[abilityName] == false || player.abilities[abilityName] == false){
            console.log("User should not have been allowed to activate ability");
        }

        else{
            // !! SIMPLIFIED FOR TESTING, ENSURE ABILITIES ARE USED ONCE TESTED
            // player.abilities[abilityName] = false;

            switch (abilityName){
                case "eliminateOne":
                    socket.emit("eliminateAnAnswer");

                case "secondSelection":
                    socket.emit("forceSelectTwoAnswers");

                case "doublePts":
                    player.doubleMyPts = true;

                case "seeAllSubmission":
            }       socket.emit("showAllSubmissions");
        }
    });

    socket.on("requestedEliminationTargets", (index1, index2) => {
        let eliminatedAnswer = undefined;
        if (gameState.answer == gameState.allAnswers[index1]){
            eliminatedAnswer = index2;
        }
        else if (gameState.answer == gameState.allAnswers[index2]){
            eliminatedAnswer = index1;
        }
        else{
            if (Math.random() < 0.5){
                eliminatedAnswer = index1;
            }
            else{
                eliminatedAnswer = index2;
            }
        }
        socket.emit("eliminateAnswer", eliminatedAnswer);
    })

    socket.on("requestSounds", (ID) => {
        const player = players.find(player => player.playerID = ID);
        socket.emit("displaySounds", player.sounds);
        //console.log(player.sounds);
    });

    socket.on("playSound", (soundDescription, ID) => {
        //console.log("script ready to play sound")
        const player = players.find(player => player.playerID = ID);
        //console.log(player);
        player.removeSound(soundDescription);
        socket.broadcast.emit("sendHostSound", soundDescription, hostID);
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
    let ptsThisRound = 0;
    let doubleMyPts = false;
    let abilities = {eliminateOne: true, secondSelection: true, doublePts: true, seeAllSubmissions: true};
    let sounds = []; // [[soundName, numSounds], ...]
    let isReady = false;
    const addSound = (soundDescription) => {
        const existingSound = sounds.find(sound => sound[0] == soundDescription);
        if (existingSound == undefined){
            sounds.push([soundDescription, 1]);
        }
        else{
            existingSound[1]++;
        }
        //console.log(sounds);
    }
    const removeSound = (soundDescription) => {
        const sound = sounds.find(sound => sound[0] == soundDescription);
        if (sound[1] > 1){
            sounds[1]--;
        }
        else{
            const index = sounds.indexOf(sound);
            sounds.splice(index, 1);
        }
    }
    return {playerName, playerID, playerImg, initialGuess, finalAnswer, pts, ptsThisRound, doubleMyPts, abilities, sounds, isReady, addSound, removeSound}
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
    gameState.updateAvailableAbilities();
    io.emit("nextQuestion", gameState.question, gameState.abilitiesToUse, hostID);
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
        players[i].ptsThisRound = 0;
        players[i].initialGuess = "";
        players[i].finalAnswer = "";
        players[i].isReady = false;
    }
}

function adjustPts(){
    const lastPlayer = players.reduce((loser, current) => current.pts < loser.pts ? current : loser);
    // calculate points earned by each player
    // !! account for players who used second selection ability
    for (let i = 0; i < players.length; i++){
        if (players[i].initialGuess == gameState.answer){
            players[i].ptsThisRound += FIRSTTRYPTS;
        }
        if (players[i].finalAnswer == gameState.answer){
            players[i].ptsThisRound += SECONDGUESSPTS;
        }
        // award fooling points only if opponents pick "YOUR" answer 
        // no points if they pick their own answer, which happens to also be yours
        for (let j = 0; j < players.length; j++){
            if (players[j].finalAnswer == players[i].initialGuess && players[j].finalAnswer != gameState.answer){
                if (players[j].finalAnswer != players[j].initialGuess){
                    players[i].ptsThisRound += FOOLPTS;
                }
            }
        }

        // players who picked cursed answer give ALL their points that round to the losing player
        if (players[i].finalAnswer == lastPlayer.initialGuess && lastPlayer.initialGuess != gameState.answer && players[i].finalAnswer != players[i].initialGuess){
            lastPlayer.pts += players[i].ptsThisRound;
            players[i].ptsThisRound = 0;
            players[i].addSound("complain");
        }
    
        players[i].pts += players[i].ptsThisRound;

        // double points ability NOT STOLEN BY CURSES
        if (players[i].doubleMyPts){
            players[i].pts += players[i].ptsThisRound;
            players[i].doubleMyPts = false;
        }
        console.log(`this round ${players[i].playerName} got ${players[i].ptsThisRound} pts`);
        console.log(`${players[i].playerName} has ${players[i].pts} total`);
    }

    const noPtsThisRound = players.filter(player => player.ptsThisRound == 0);
    if (noPtsThisRound.length == 1){
        players[0].addSound("encourage");
    }
}