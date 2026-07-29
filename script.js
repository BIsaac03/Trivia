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

const gamesInProgress = [];

const gameState = {
    gameHasStarted: false,
    players: [],
    question: "",
    answer: "",
    img: "",
    continent: undefined,
    additionalInfo: "",
    allAnswers: [],
    rawAnswers: [],
    questionNum: 0,
    totalQuestions: questions.length,
    waitingOn: "initialGuesses",
    // !! set back to correct values after testing
    abilitiesToUse: {eliminateOne: true, continentCheck: true, doublePts: true, seeAllSubmissions: true},
    loadNextQuestion(question) {
        this.question = question.questionText;
        this.answer = question.answer;
        this.img = question.image;
        this.continent = question.continent;
        this.additionalInfo = question.additionalInfo;
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
let roomCode = undefined;

io.on("connection", (socket) => {
    socket.on("userConnected", (ID) => {
        const returningPlayer = gameState.players.find(player => player.playerID == ID)
        if (returningPlayer == undefined && ID != hostID){
            socket.emit("newConnection");
        }
        else{
            socket.emit("reconnection", hostID, roomCode, gameState, gameState.players);
        }
    });

    socket.on("createHost", (ID) => {
        if (hostID == undefined){
            hostID = ID;
            roomCode = (Math.random().toString(36).slice(2, 6)).toUpperCase();
            socket.emit("hostSetUp", roomCode);
        }
    });

    socket.on("playerJoined", (name, ID, img, code) => {
        if (gameState.gameHasStarted == false){
            if (code != roomCode){
                socket.emit("invalidRoomCode");
            }
            else{
                const existingPlayer = gameState.players.find(player => player.playerID == ID);
                if (existingPlayer == undefined){
                    const nameInUse = gameState.players.find(player => player.playerName == name);
                    if (nameInUse == undefined){
                        const newPlayer = makePlayer(name, ID, img);
                        gameState.players.push(newPlayer);
                        socket.broadcast.emit("playerJoined", newPlayer, hostID);
                        socket.emit("waitingInLobby");
                    }
                    else{
                        socket.emit("nameInUse", name);
                    }
                }
                else{
                    existingPlayer.playerName = name;
                    existingPlayer.playerImg = img;
                    socket.broadcast.emit("playerModified", existingPlayer, hostID);
                    socket.emit("waitingInLobby");
                }
            }
        }
        else{
            socket.emit("gameInProgress");
        }
    });

    socket.on("abandonLobby", (ID) => {
        // !! delete lobby
    });

    socket.on("attemptStart", () => {
        if (gameState.players.length > 1){
            gameState.gameHasStarted = true;
            io.emit("startTrivia", gameState.players, gameState, hostID);
            io.emit("unreadyAllPlayers", hostID);
            sendNextQuesetion();
        }
        else{
            // !! send 'too few players' message
        }
    })
    
    socket.on("madeFirstGuess", (ID, guess) => {
        const player = gameState.players.find(player => player.playerID == ID);
        if (player != undefined){
            player.timeOfInitialGuess = Date.now();
            player.initialGuess = guess;
            player.isReady = true;
            io.emit("playerReady", ID, hostID);

            // all players have submitted their initial guess
            if (allPlayersAreReady()){
                const rawAnswers = compileAnswers();
                gameState.rawAnswers = rawAnswers;
                gameState.waitingOn = "answerModification";
                io.emit("sendAnswersForModification", gameState.players, gameState.answer, hostID);
            }
        }
    })

    socket.on("getModifiedAnswers", (modifiedAnswers) => {
        const currentTime = Date.now();
        for (let i = 0; i < gameState.players.length; i++){
            gameState.players[i].initialGuess = modifiedAnswers[i];
            gameState.players[i].isReady = false;
            // awards sound if more than a minute has elapsed between submitting guess and receiving answers
            if (currentTime - gameState.players[i].timeOfInitialGuess > 60000){
                gameState.players[i].addSound("Slowpokes to hurry up");
            }
        }
        io.emit("unreadyAllPlayers", hostID);
        const answers = compileAnswers();
        gameState.allAnswers = answers;
        gameState.waitingOn = "finalAnswers";
        io.emit("sendAnswerChoices", answers, hostID);
    });

    socket.on("choseFinalAnswer", (ID, guessNum) => {
        const player = gameState.players.find(player => player.playerID == ID);
        if (player != undefined){
            player.finalAnswer = gameState.allAnswers[guessNum];
            player.isReady = true;
            io.emit("playerReady", player.playerID, hostID);

            // all players have submitted their final answer
            if (allPlayersAreReady()){
                for (let i = 0; i < gameState.players.length; i++){
                    gameState.players[i].isReady = false;
                    io.emit("unreadyAllPlayers", hostID);
                }
                gameState.waitingOn = "answerReveal";
                io.emit("revealAnswer", gameState.players, gameState.answer, hostID);
                adjustPts();
                io.emit("updateScores", gameState.players, hostID);
            }
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
        const player = gameState.players.find(player => player.playerID == ID);
        if (player != undefined){
            socket.emit("displayAbilities", player.abilities, gameState.abilitiesToUse);
        }
    });

    socket.on("useAbility", (abilityName, ID) => {
        const player = gameState.players.find(player => player.playerID == ID);
        if (player != undefined){
            if (gameState.waitingOn != "finalAnswers" && abilityName != "continentCheck"){
                socket.emit("illegalAbilityUse", "You cannot use this ability until all players have submitted their initial guesses.");
            }
            else if (player.finalAnswer != ""){
                socket.emit("illegalAbilityUse", "You have already submitted your final answer.");
            }

            else if (gameState.abilitiesToUse[abilityName] == false || player.abilities[abilityName] == false){
                console.log("User should not have been allowed to activate ability");
            }

            else{
                switch (abilityName){
                    case "eliminateOne":
                        socket.emit("eliminateAnAnswer");
                        break;

                    case "continentCheck":
                        player.abilities.continentCheck = false;
                        player.abilitiesUsedThisRound.continentCheck = gameState.continent;
                        socket.emit("tellContinent", gameState.continent);
                        break;

                    case "doublePts":
                        player.abilities.doublePts = false;
                        player.abilitiesUsedThisRound.doublePts = true;
                        socket.emit("addDoublePtsIcon");
                        break;

                    case "seeAllSubmissions":
                        player.abilities.seeAllSubmissions = false;
                        player.abilitiesUsedThisRound.seeAllSubmissions = gameState.rawAnswers;
                        socket.emit("showAllSubmissions", gameState.rawAnswers);
                        break;
                }       
            }
        }
    });

    socket.on("requestedEliminationTargets", (index1, index2, ID) => {
        const player = gameState.players.find(player => player.playerID == ID);
        if (player != undefined){
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

            player.abilities.eliminateOne = false;
            player.abilitiesUsedThisRound.eliminateOne = eliminatedAnswer;
            socket.emit("eliminateAnswer", eliminatedAnswer);
        } 
    })

    socket.on("requestSounds", (ID) => {
        const player = gameState.players.find(player => player.playerID == ID);
        if (player != undefined){
            socket.emit("displaySounds", player.sounds);
        }
    });

    socket.on("playSound", (soundDescription, ID) => {
        const player = gameState.players.find(player => player.playerID == ID);
        if (player != undefined){
            const hasSound = player.sounds.find((sound) => sound[0] == soundDescription);
            if (hasSound){
                player.removeSound(soundDescription);
                socket.broadcast.emit("sendHostSound", soundDescription, ID, player.playerName, hostID);
            }
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
    let timeOfInitialGuess = undefined;
    let initialGuess = '';
    let finalAnswer = '';
    let pts = 0;
    let ptsThisRound = 0;
    let abilities = {eliminateOne: true, continentCheck: true, doublePts: true, seeAllSubmissions: true};
    let abilitiesUsedThisRound = {eliminateOne: null, continentCheck: null, doublePts: null, seeAllSubmissions: null};
    let sounds = []; // [[soundName, numSounds], ...]
    let hasAcquiredFirstSound = false;
    let isReady = false;
    const addSound = (soundDescription) => {
        if (hasAcquiredFirstSound == false){
            firstSound(playerID);
        }
        const existingSound = sounds.find(sound => sound[0] == soundDescription);
        if (existingSound == undefined){
            sounds.push([soundDescription, 1]);
        }
        else{
            existingSound[1]++;
        }
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
    return {playerName, playerID, playerImg, timeOfInitialGuess, initialGuess, finalAnswer, pts, ptsThisRound, abilities, abilitiesUsedThisRound, sounds, hasAcquiredFirstSound, isReady, addSound, removeSound}
}

function firstSound(ID){
    const player = gameState.players.find((player) => player.playerID == ID);
    player.hasAcquiredFirstSound = true;
    io.emit("firstSoundAcquired", ID);
}

function allPlayersAreReady(){
    const waitingOnPlayer = gameState.players.find(player => player.isReady == false);
    if (waitingOnPlayer == undefined){
        return true;
    }
    else{ return false }
}

function sendNextQuesetion(){
    gameState.loadNextQuestion(questions[gameState.questionNum]);
    gameState.updateAvailableAbilities();
    gameState.waitingOn = "initialGuesses";
    io.emit("nextQuestion", gameState.question, gameState.img, gameState.additionalInfo, gameState.abilitiesToUse, hostID);
}

function compileAnswers(){
    const answers = []
    answers.push(gameState.answer);
    for (let i = 0; i < gameState.players.length; i++){
        answers.push(gameState.players[i].initialGuess);
    }
    return [...new Set(answers.sort())];
}

function resetPlayers(){
    for (let i = 0; i < gameState.players.length; i++){
        gameState.players[i].ptsThisRound = 0;
        gameState.players[i].initialGuess = "";
        gameState.players[i].finalAnswer = "";
        gameState.players[i].abilitiesUsedThisRound.eliminateOne = null;
        gameState.players[i].abilitiesUsedThisRound.continentCheck = null;
        gameState.players[i].abilitiesUsedThisRound.doublePts = null;
        gameState.players[i].abilitiesUsedThisRound.seeAllSubmissions = null;
        gameState.players[i].isReady = false;
    }
}

function adjustPts(){
    let losingPlayer = gameState.players.reduce((loser, current) => current.pts < loser.pts ? current : loser);
    const checkUniqueness = gameState.players.filter(player => player.pts == losingPlayer.pts);
    if (checkUniqueness.length > 1){
        losingPlayer = undefined;
    }
    // calculate points earned by each player
    for (let i = 0; i < gameState.players.length; i++){
        if (gameState.players[i].initialGuess == gameState.answer){
            gameState.players[i].ptsThisRound += FIRSTTRYPTS;
            gameState.players[i].addSound("To brag");
        }
        if (gameState.players[i].finalAnswer == gameState.answer){
            gameState.players[i].ptsThisRound += SECONDGUESSPTS;
        }
        // award fooling points only if opponents pick "YOUR" answer 
        // no points if they pick their own answer, which happens to also be yours
        for (let j = 0; j < gameState.players.length; j++){
            if (gameState.players[j].finalAnswer == gameState.players[i].initialGuess && gameState.players[j].finalAnswer != gameState.answer){
                if (gameState.players[j].finalAnswer != gameState.players[j].initialGuess){
                    gameState.players[i].ptsThisRound += FOOLPTS;
                }
            }
        }

        // players who picked cursed answer give ALL their points that round to the losing player
        if (losingPlayer != undefined){
            if (gameState.players[i].finalAnswer == losingPlayer.initialGuess && losingPlayer.initialGuess != gameState.answer && gameState.players[i].finalAnswer != gameState.players[i].initialGuess){
                losingPlayer.pts += gameState.players[i].ptsThisRound;
                gameState.players[i].ptsThisRound = 0;
                gameState.players[i].addSound("To complain");
            }
        }
        
        gameState.players[i].pts += gameState.players[i].ptsThisRound;

        // double points ability NOT STOLEN BY CURSES
        if (gameState.players[i].abilitiesUsedThisRound.doublePts){
            gameState.players[i].pts += gameState.players[i].ptsThisRound;
        }
        //console.log(`this round ${gameState.players[i].playerName} got ${gameState.players[i].ptsThisRound} pts`);
        //console.log(`${gameState.players[i].playerName} has ${gameState.players[i].pts} total`);
    }

    const noPtsThisRound = gameState.players.filter(player => player.ptsThisRound == 0);
    if (noPtsThisRound.length == 1){
        noPtsThisRound[0].addSound("Encouragement");
    }
}