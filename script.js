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

io.on("connection", (socket) => {
    // !! add socket rooms so users in different lobbies do not both receive all events
    socket.on("userConnected", (ID) => {
        let ongoingGame = gamesInProgress.find((game) => game.players.find((player) => player.playerID == ID));
        if (!ongoingGame){
            ongoingGame = gamesInProgress.find((game) => game.hostID == ID);
        }
        if (ongoingGame){
            socket.emit("reconnection", ongoingGame.hostID, ongoingGame.roomCode, ongoingGame, ongoingGame.players);
        }
        if (!ongoingGame){
            socket.emit("newConnection");
        }
    });

    socket.on("createHost", (ID) => {
        const roomCode = (Math.random().toString(36).slice(2, 6)).toUpperCase();
        const newGame = makeGame(ID, roomCode);
        gamesInProgress.push(newGame);
        socket.emit("hostSetUp", roomCode);
    });

    socket.on("playerJoined", (name, ID, img, code) => {
        const gameToJoin = gamesInProgress.find((game) => game.roomCode == code);
        if (!gameToJoin){
            socket.emit("invalidRoomCode");
        }
        else if (gameToJoin.gameHasStarted){
            socket.emit("gameInProgress");
        }
        else{
            const nameInUse = gameToJoin.players.find((player) => (player.playerName == name && player.playerID != ID));
            if (nameInUse){
                socket.emit("nameInUse", name);
            }
            else{
                const existingPlayer = gameToJoin.players.find((player) => player.playerID == ID);
                if (!existingPlayer){
                    const newPlayer = makePlayer(name, ID, img);
                    gameToJoin.players.push(newPlayer);
                    socket.broadcast.emit("playerJoined", newPlayer, gameToJoin.hostID);
                    socket.emit("waitingInLobby");
                }
                else{
                    existingPlayer.playerName = name;
                    existingPlayer.playerImg = img;
                    socket.broadcast.emit("playerModified", existingPlayer, gameToJoin.hostID);
                    socket.emit("waitingInLobby");   
                }
            }     
        }
    });

    socket.on("abandonLobby", (ID) => {
        const gameToDelete = gamesInProgress.find((game) => game.players.find((player) => player.playerID == ID));
        const index = gamesInProgress.indexOf(gameToDelete);
        if (index != -1) {
            gamesInProgress.splice(index, 1); 
            console.log(gamesInProgress);
        }
        // !! send kill signals to all players in same lobby
    });

    socket.on("attemptStart", (ID) => {
        const ongoingGame = gamesInProgress.find((game) => game.hostID == ID);
        if (ongoingGame.players.length > 1){
            ongoingGame.gameHasStarted = true;
            io.emit("startTrivia", ongoingGame.players, ongoingGame, ongoingGame.hostID);
            io.emit("unreadyAllPlayers", ongoingGame.hostID);
            sendNextQuesetion(ongoingGame);
        }
        else{
            // !! send 'too few players' message
        }
    })
    
    socket.on("madeFirstGuess", (ID, guess) => {
        const ongoingGame = gamesInProgress.find((game) => game.players.find((player) => player.playerID == ID));
        const player = ongoingGame.players.find((player) => player.playerID == ID);
        if (player){
            player.timeOfInitialGuess = Date.now();
            player.initialGuess = guess;
            player.isReady = true;
            io.emit("playerReady", ID, ongoingGame.hostID);

            // all players have submitted their initial guess
            if (allPlayersAreReady(ongoingGame)){
                const rawAnswers = compileAnswers(ongoingGame);
                ongoingGame.rawAnswers = rawAnswers;
                ongoingGame.waitingOn = "answerModification";
                io.emit("sendAnswersForModification", ongoingGame.players, ongoingGame.answer, ongoingGame.hostID);
            }
        }
    })

    socket.on("getModifiedAnswers", (modifiedAnswers, ID) => {
        const ongoingGame = gamesInProgress.find((game) => game.hostID == ID);
        const currentTime = Date.now();
        for (let i = 0; i < ongoingGame.players.length; i++){
            ongoingGame.players[i].initialGuess = modifiedAnswers[i];
            ongoingGame.players[i].isReady = false;
            // awards sound if more than a minute has elapsed between submitting guess and receiving answers
            if (currentTime - ongoingGame.players[i].timeOfInitialGuess > 60000){
                ongoingGame.players[i].addSound("Slowpokes to hurry up");
            }
        }
        io.emit("unreadyAllPlayers", ongoingGame.hostID);
        const answers = compileAnswers(ongoingGame);
        ongoingGame.allAnswers = answers;
        ongoingGame.waitingOn = "finalAnswers";
        io.emit("sendAnswerChoices", answers, ongoingGame.hostID);
    });

    socket.on("choseFinalAnswer", (ID, guessNum) => {
        const ongoingGame = gamesInProgress.find((game) => game.players.find((player) => player.playerID == ID));
        const player = ongoingGame.players.find((player) => player.playerID == ID);
        if (player){
            player.finalAnswer = ongoingGame.allAnswers[guessNum];
            player.isReady = true;
            io.emit("playerReady", player.playerID, ongoingGame.hostID);

            // all players have submitted their final answer
            if (allPlayersAreReady(ongoingGame)){
                for (let i = 0; i < ongoingGame.players.length; i++){
                    ongoingGame.players[i].isReady = false;
                    io.emit("unreadyAllPlayers", ongoingGame.hostID);
                }
                ongoingGame.waitingOn = "answerReveal";
                io.emit("revealAnswer", ongoingGame.players, ongoingGame.answer, ongoingGame.hostID);
                adjustPts(ongoingGame);
                io.emit("updateScores", ongoingGame.players, ongoingGame.hostID);
            }
        }  
    })

    socket.on("finishedRound", (ID) => {
        const ongoingGame = gamesInProgress.find((game) => game.hostID == ID);
        if (ongoingGame.questionNum == questions.length){
            // !! end questions; display final scores on HOST
        }
        else{
            resetPlayers(ongoingGame);
            ongoingGame.allAnswers = [];
            io.emit("unreadyAllPlayers", ongoingGame.hostID);
            sendNextQuesetion(ongoingGame);
        }
    });

    socket.on("requestAbilities", (ID) => {
        const ongoingGame = gamesInProgress.find((game) => game.players.find((player) => player.playerID == ID));
        const player = ongoingGame.players.find((player) => player.playerID == ID);
        if (player){
            socket.emit("displayAbilities", player.abilities, ongoingGame.abilitiesToUse);
        }
    });

    socket.on("useAbility", (abilityName, ID) => {
        const ongoingGame = gamesInProgress.find((game) => game.players.find((player) => player.playerID == ID));
        const player = ongoingGame.players.find((player) => player.playerID == ID);
        if (player){
            if (ongoingGame.waitingOn != "finalAnswers" && abilityName != "continentCheck"){
                socket.emit("illegalAbilityUse", "You cannot use this ability until all players have submitted their initial guesses.");
            }
            else if (player.finalAnswer != ""){
                socket.emit("illegalAbilityUse", "You have already submitted your final answer.");
            }

            else if (ongoingGame.abilitiesToUse[abilityName] == false || player.abilities[abilityName] == false){
                console.log("User should not have been allowed to activate ability");
            }

            else{
                switch (abilityName){
                    case "eliminateOne":
                        socket.emit("eliminateAnAnswer");
                        break;

                    case "continentCheck":
                        player.abilities.continentCheck = false;
                        player.abilitiesUsedThisRound.continentCheck = ongoingGame.continent;
                        socket.emit("tellContinent", ongoingGame.continent);
                        break;

                    case "doublePts":
                        player.abilities.doublePts = false;
                        player.abilitiesUsedThisRound.doublePts = true;
                        socket.emit("addDoublePtsIcon");
                        break;

                    case "seeAllSubmissions":
                        player.abilities.seeAllSubmissions = false;
                        player.abilitiesUsedThisRound.seeAllSubmissions = ongoingGame.rawAnswers;
                        socket.emit("showAllSubmissions", ongoingGame.rawAnswers);
                        break;
                }       
            }
        }
    });

    socket.on("requestedEliminationTargets", (index1, index2, ID) => {
        const ongoingGame = gamesInProgress.find((game) => game.players.find((player) => player.playerID == ID));
        const player = ongoingGame.players.find((player) => player.playerID == ID);
        if (player){
            let eliminatedAnswer = undefined;
            if (ongoingGame.answer == ongoingGame.allAnswers[index1]){
                eliminatedAnswer = index2;
            }
            else if (ongoingGame.answer == ongoingGame.allAnswers[index2]){
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
        const ongoingGame = gamesInProgress.find((game) => game.players.find((player) => player.playerID == ID));
        const player = ongoingGame.players.find((player) => player.playerID == ID);
        if (player){
            socket.emit("displaySounds", player.sounds);
        }
    });

    socket.on("playSound", (soundDescription, ID) => {
        const ongoingGame = gamesInProgress.find((game) => game.players.find((player) => player.playerID == ID));
        const player = ongoingGame.players.find((player) => player.playerID == ID);
        if (player){
            const hasSound = player.sounds.find((sound) => sound[0] == soundDescription);
            if (hasSound){
                player.removeSound(soundDescription);
                socket.broadcast.emit("sendHostSound", soundDescription, ID, player.playerName, ongoingGame.hostID);
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

function makeGame(ID, code){
    const hostID = ID;
    const roomCode = code;
    let gameHasStarted = false;
    let players = [];
    let question = "";
    let answer = "";
    let img = "";
    let continent = undefined;
    let additionalInfo = "";
    let allAnswers = [];
    let rawAnswers = [];
    let questionNum = 0;
    let totalQuestions = questions.length;
    let waitingOn = "initialGuesses";
    // !! set back to correct values after testing
    let abilitiesToUse = {eliminateOne: true, continentCheck: true, doublePts: true, seeAllSubmissions: true};
    const loadNextQuestion = (q) => {
        question = q.questionText;
        answer = q.answer;
        img = q.image;
        continent = q.continent;
        additionalInfo = q.additionalInfo;
        questionNum++;
        console.log(answer);
        console.log(questionNum);
    };
    const updateAvailableAbilities = () => {
        // !! add round availability for each ability
        if (questionNum > 1){
            abilitiesToUse.doublePts = true;
        }
    };
    return {hostID, roomCode, gameHasStarted, players, question, answer, img, continent, additionalInfo, allAnswers, rawAnswers, questionNum, totalQuestions, waitingOn, abilitiesToUse, loadNextQuestion, updateAvailableAbilities}
}

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
        const existingSound = sounds.find((sound) => sound[0] == soundDescription);
        if (!existingSound){
            sounds.push([soundDescription, 1]);
        }
        else{
            existingSound[1]++;
        }
    };
    const removeSound = (soundDescription) => {
        const sound = sounds.find((sound) => sound[0] == soundDescription);
        if (sound[1] > 1){
            sounds[1]--;
        }
        else{
            const index = sounds.indexOf(sound);
            sounds.splice(index, 1);
        }
    };
    return {playerName, playerID, playerImg, timeOfInitialGuess, initialGuess, finalAnswer, pts, ptsThisRound, abilities, abilitiesUsedThisRound, sounds, hasAcquiredFirstSound, isReady, addSound, removeSound}
}

function firstSound(ID){
    const ongoingGame = gamesInProgress.find((game) => game.players.find((player) => player.playerID == ID));
    const player = ongoingGame.players.find((player) => player.playerID == ID);
    player.hasAcquiredFirstSound = true;
    io.emit("firstSoundAcquired", ID);
}

function allPlayersAreReady(ongoingGame){
    const waitingOnPlayer = ongoingGame.players.find((player) => player.isReady == false);
    return waitingOnPlayer;
}

function sendNextQuesetion(ongoingGame){
    ongoingGame.loadNextQuestion(questions[ongoingGame.questionNum]);
    ongoingGame.updateAvailableAbilities();
    ongoingGame.waitingOn = "initialGuesses";
    io.emit("nextQuestion", ongoingGame.question, ongoingGame.img, ongoingGame.additionalInfo, ongoingGame.abilitiesToUse, ongoingGame.hostID);
}

function compileAnswers(ongoingGame){
    const answers = []
    answers.push(ongoingGame.answer);
    for (let i = 0; i < ongoingGame.players.length; i++){
        answers.push(ongoingGame.players[i].initialGuess);
    }
    return [...new Set(answers.sort())];
}

function resetPlayers(ongoingGame){
    for (let i = 0; i < ongoingGame.players.length; i++){
        ongoingGame.players[i].ptsThisRound = 0;
        ongoingGame.players[i].initialGuess = "";
        ongoingGame.players[i].finalAnswer = "";
        ongoingGame.players[i].abilitiesUsedThisRound.eliminateOne = null;
        ongoingGame.players[i].abilitiesUsedThisRound.continentCheck = null;
        ongoingGame.players[i].abilitiesUsedThisRound.doublePts = null;
        ongoingGame.players[i].abilitiesUsedThisRound.seeAllSubmissions = null;
        ongoingGame.players[i].isReady = false;
    }
}

function adjustPts(ongoingGame){
    let losingPlayer = ongoingGame.players.reduce((loser, current) => current.pts < loser.pts ? current : loser);
    const checkUniqueness = ongoingGame.players.filter(player => player.pts == losingPlayer.pts);
    if (checkUniqueness.length > 1){
        losingPlayer = undefined;
    }
    // calculate points earned by each player
    for (let i = 0; i < ongoingGame.players.length; i++){
        if (ongoingGame.players[i].initialGuess == ongoingGame.answer){
            ongoingGame.players[i].ptsThisRound += FIRSTTRYPTS;
            ongoingGame.players[i].addSound("To brag");
        }
        if (ongoingGame.players[i].finalAnswer == ongoingGame.answer){
            ongoingGame.players[i].ptsThisRound += SECONDGUESSPTS;
        }
        // award fooling points only if opponents pick "YOUR" answer 
        // no points if they pick their own answer, which happens to also be yours
        for (let j = 0; j < ongoingGame.players.length; j++){
            if (ongoingGame.players[j].finalAnswer == ongoingGame.players[i].initialGuess && ongoingGame.players[j].finalAnswer != ongoingGame.answer){
                if (ongoingGame.players[j].finalAnswer != ongoingGame.players[j].initialGuess){
                    ongoingGame.players[i].ptsThisRound += FOOLPTS;
                }
            }
        }

        // players who picked cursed answer give ALL their points that round to the losing player
        if (losingPlayer){
            if (ongoingGame.players[i].finalAnswer == losingPlayer.initialGuess && losingPlayer.initialGuess != ongoingGame.answer && ongoingGame.players[i].finalAnswer != ongoingGame.players[i].initialGuess){
                losingPlayer.pts += ongoingGame.players[i].ptsThisRound;
                ongoingGame.players[i].ptsThisRound = 0;
                ongoingGame.players[i].addSound("To complain");
            }
        }
        
        ongoingGame.players[i].pts += ongoingGame.players[i].ptsThisRound;

        // double points ability NOT STOLEN BY CURSES
        if (ongoingGame.players[i].abilitiesUsedThisRound.doublePts){
            ongoingGame.players[i].pts += ongoingGame.players[i].ptsThisRound;
        }
        //console.log(`this round ${ongoingGame.players[i].playerName} got ${ongoingGame.players[i].ptsThisRound} pts`);
        //console.log(`${ongoingGame.players[i].playerName} has ${ongoingGame.players[i].pts} total`);
    }

    const noPtsThisRound = ongoingGame.players.filter(player => player.ptsThisRound == 0);
    if (noPtsThisRound.length == 1){
        noPtsThisRound[0].addSound("Encouragement");
    }
}