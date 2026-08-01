if (document.cookie == ""){
    document.cookie = "userID=p"+crypto.randomUUID();
}
const userIDCookie = document.cookie;
const myID = userIDCookie.slice(7);

//const socket = io("https://trivia-k294.onrender.com/", {
const socket = io("http://localhost:3000", {
    auth: {
        token: userIDCookie
    }
});

const bodyElement = document.body;

socket.on("connect", () => {  
    document.body.innerHTML = "";
    socket.emit("userConnected", myID);
});

socket.on("reconnection", (gameDetails, roundDetails, players) => {
    // restore HOST state
    if (window.name == "answerModifier"){
        displayScores(players);
        if (gameDetails.waitingOn == "answerModification"){
            displayAnswersToModify(players, roundDetails.answer);
        }
    }
    else if (gameDetails.hostID == myID){
        if (!gameDetails.gameHasStarted){
            displayLobby(gameDetails.roomCode, players);
        }
        else{
            setUpHostDisplay(players, roundDetails, gameDetails);
            updateStatuses(players);
            displayQuestion(roundDetails.question, roundDetails.img);

            if (gameDetails.waitingOn == "revealFinalScores"){
                revealFinalScores(players);
            }
            else if (gameDetails.waitingOn != "initialGuesses"){
                hostDisplayAnswers(roundDetails.allAnswers);
                if (gameDetails.waitingOn == "answerReveal"){
                    revealAnswers(players, roundDetails.answer);
                }
            }
        }
    }
    // retore PLAYER state
    else{
        // joining a lobby
        if (!gameDetails.gameHasStarted){
            const alreadyJoined = players.find((player) => player.playerID == myID);
            if (!alreadyJoined){
                firstTimePlayerSetup();
            }
            else{
                firstTimePlayerSetup();
                fillInPlayerInfo(alreadyJoined);
                waitingInLobby();
            }
        }

        // joining an ongoing game
        else{
            const me = players.find((player) => player.playerID == myID);
            if (me){
                setUpPlayerDisplay();
                if (me.hasAcquiredFirstSound){
                    addSoundMenu();
                }
                if (me.abilitiesUsedThisRound.continentCheck){
                    messagePopUp(me.abilitiesUsedThisRound.continentCheck, bodyElement, "continent", 0, true);
                }
                displayAdditionalInfo(roundDetails.additionalInfo);
                if (me.initialGuess == ''){
                    readyNewSubmission();
                }
                else if (me.finalAnswer == ''){
                    if (roundDetails.allAnswers.length == 0){
                        const userGuess = document.querySelector(`.guess input`);
                        const submitBtn = document.querySelector(`#makeInitialGuess`);

                        userGuess.placeholder = "Submitted!";
                        userGuess.disabled = true;
                        userGuess.value = "";  
                        submitBtn.disabled = true;
                    }
                    else{
                        playerDisplayAnswers(roundDetails.allAnswers);
                        toggleVisibleSelections();

                        if (me.abilitiesUsedThisRound.eliminateOne){
                            eliminatePotentialAnswer(me.abilitiesUsedThisRound.eliminateOne);
                        }
                        if (me.abilitiesUsedThisRound.doublePts){
                            addDoublePtsIcon();
                        }
                        if (me.abilitiesUsedThisRound.seeAllSubmissions){
                            showAllSubmissions(me.abilitiesUsedThisRound.seeAllSubmissions);
                        }
                    }
                    
                }
                else{
                    playerDisplayAnswers(roundDetails.allAnswers);
                    toggleVisibleSelections();
                    const answerChoices = document.querySelector(`.answerChoices`);
                    const confirmFinalAnswer = document.getElementById("confirmFinalAnswer");

                    const answersDOM = answerChoices.children;
                    const answers = [...answersDOM];
                    answers.forEach((answer) => {
                        answer.disabled = true;
                        if (roundDetails.allAnswers[answer.textContent-1] == me.finalAnswer){
                            answer.id = "finalAnswer";
                        }
                    });
                    confirmFinalAnswer.disabled = true;
                }
            }

            else{
                const me = document.getElementById("me");
                messagePopUp("A game is already in progress.", me, "gameInProgressError", 2000, false)
            }
        }
    }   
});


////// PLAYER events
socket.on("newConnection", () => {
    firstTimePlayerSetup();
});

socket.on("invalidRoomCode", () => {
const me = document.getElementById("me");
    messagePopUp("A room with that code does not exist.", me, "invalidCodeError", 2000, false)
})

socket.on("nameInUse", (name) => {
    const me = document.getElementById("me");
    messagePopUp(`Another player has already claimed the name: ${name}`, me, "nameTakenError", 2000, false);
});

socket.on("gameInProgress", () => {
    const me = document.getElementById("me");
    messagePopUp("A game is already in progress.", me, "gameInProgressError", 2000, false)
});

socket.on("waitingInLobby", () => {
    waitingInLobby();
})

socket.on("displayAbilities", (myAbilities, abilitiesUsedThisRound, currentlyAvailableAbilities) => {
    const hasUsedAnAbility = Object.values(abilitiesUsedThisRound).some(Boolean);
    const abilityPopUp = document.createElement("div");
    abilityPopUp.id = "abilityPopUp";

    displayAbility("eliminateOne", myAbilities.eliminateOne, hasUsedAnAbility, currentlyAvailableAbilities.eliminateOne, abilityPopUp,
                    "Pick two answers. An incorrect one is removed.");
    displayAbility("continentCheck", myAbilities.continentCheck, hasUsedAnAbility, currentlyAvailableAbilities.continentCheck, abilityPopUp,
                    "Learn which continent the correct answer is located in.");
    displayAbility("doublePts", myAbilities.doublePts, hasUsedAnAbility, currentlyAvailableAbilities.doublePts, abilityPopUp,
                    "Double the points you earn this round.\nPoints earned/lost from cursing are not doubled.");
    displayAbility("seeAllSubmissions", myAbilities.seeAllSubmissions, hasUsedAnAbility, currentlyAvailableAbilities.seeAllSubmissions, abilityPopUp,
                    "See ALL players' answers (along with the correct one), unedited.");

    document.addEventListener("click", (event) => {
        if (!abilityPopUp.contains(event.target)) {
            abilityPopUp.remove();
        }
    });

    bodyElement.appendChild(abilityPopUp);
})

socket.on("displaySounds", (mySounds) => {
    const soundsPopUp = document.createElement("div");
    soundsPopUp.id = "soundsPopUp";
    bodyElement.appendChild(soundsPopUp);

    if (mySounds.length == 0){
        messagePopUp("You have no sounds! Do cool things to earn more.", soundsPopUp, "noSoundsMsg", 3000, true);
    }

    else{
        const titleDiv = document.createElement("div");
        titleDiv.classList.add("sound");
        const description = document.createElement("p");
        const numRemaining = document.createElement("p");
        description.textContent = "Play when you want...";
        numRemaining.textContent = "#";
        titleDiv.appendChild(description);
        titleDiv.appendChild(numRemaining);
        soundsPopUp.appendChild(titleDiv);
        mySounds.forEach(sound => {
            const soundDiv = document.createElement("div");
            soundDiv.classList.add("sound");
            const soundDescription = document.createElement("p");
            const soundNum = document.createElement("p");
            const soundButton = document.createElement("button");
            soundButton.textContent = "PLAY";

            soundDescription.textContent = sound[0];
            soundNum.textContent = sound[1];

            soundButton.addEventListener("click", () => {
                socket.emit("playSound", sound[0], myID);

                if (Number(soundNum.textContent) > 1){
                    soundNum.textContent = `${Number(soundNum.textContent) - 1}`;
                }
                else{
                    soundDiv.remove();
                }
            })

            soundDiv.appendChild(soundDescription);
            soundDiv.appendChild(soundNum);
            soundDiv.appendChild(soundButton);
            soundsPopUp.appendChild(soundDiv);
        });
    }

    document.addEventListener("click", (event) => {
        if (!soundsPopUp.contains(event.target)) {
            soundsPopUp.remove();
        }
    });

});

socket.on("eliminateAnAnswer", () => {
    const preSelectedAnswer = document.getElementById("finalAnswer");
    if (preSelectedAnswer){
        preSelectedAnswer.id = "";
    }

    const answersContainer = document.querySelector(`#trivia .answers`);
    const tinyAnswers = answersContainer.cloneNode(true);
    tinyAnswers.classList.add("tiny");
    bodyElement.appendChild(tinyAnswers);

    const answerChoices = tinyAnswers.firstChild;
    const submitButton = tinyAnswers.lastChild;

    submitButton.addEventListener("click", () => {
        const selectedAnswers = document.querySelectorAll(`.tiny .selected`);
        if (selectedAnswers.length == 2){
            const answerIndex1 = Number(selectedAnswers[0].textContent) - 1;
            const answerIndex2 = Number(selectedAnswers[1].textContent) - 1;
            socket.emit("requestedEliminationTargets", answerIndex1, answerIndex2, myID);
            tinyAnswers.remove();
        }
        else{
            messagePopUp("Select exactly 2 answers to designate for elimination.", tinyAnswers, "selectTwoMsg", 2000, true);
        }
    })

    const answersDOM = answerChoices.children;
    const answers = [...answersDOM];
    // prevent autoselection of element under 'USE' button
    setTimeout(() => {
        answers.forEach((answer) => {
            answer.addEventListener("click", () => {
                if (answer.classList.contains("selected")){
                    answer.classList.remove("selected");
                }
                else{
                    answer.classList.add("selected");
                }
            })
        });
    }, 50); 

    document.addEventListener("click", (event) => {
        if (!tinyAnswers.contains(event.target)) {
            tinyAnswers.remove();
        }
    });
});

socket.on("eliminateAnswer", (eliminatedAnswerIndex) => {
    eliminatePotentialAnswer(eliminatedAnswerIndex);
});

socket.on("tellContinent", (continent) => {
    messagePopUp(continent, bodyElement, "continent", 0, true);
});

socket.on("addDoublePtsIcon", () => {
    addDoublePtsIcon();
})

socket.on("showAllSubmissions", (rawAnswers) => {
    showAllSubmissions(rawAnswers);
});

socket.on("illegalAbilityUse", (message) => {
    messagePopUp(message, bodyElement, "abilityError", 4000, true);  
});
////// HOST events
socket.on("hostSetUp", (roomCode) => {
    displayLobby(roomCode, []);
})

socket.on("playerJoined", (newPlayer, hostID) => {
    if (hostID == myID && window.name != "answerModifier"){
        const playersDiv = document.getElementById("playersDiv");
        displayPlayerInLobby(newPlayer, playersDiv);
    }
});

socket.on("playerModified", (modifiedPlayer, hostID) => {
    if (hostID == myID && window.name != "answerModifier"){
        const name = document.querySelector(`.${modifiedPlayer.playerID} .name`)
        name.textContent = modifiedPlayer.playerName;

        const img = document.querySelector(`.${modifiedPlayer.playerID} .pfp`)
        img.src = modifiedPlayer.playerImg;
    }
});

socket.on("sendAnswersForModification", (players, correctAnswer, hostID) => {
    if (hostID == myID && window.name == "answerModifier"){
        displayAnswersToModify(players, correctAnswer);
    }
});

socket.on("revealAnswer", (players, answer, hostID) => {
    if (hostID == myID && window.name != "answerModifier"){
        revealAnswers(players, answer);
    }
})

socket.on("playerReady", (playerID, hostID) => {
    if (hostID == myID  && window.name != "answerModifier"){
        const status = document.querySelector(`#${playerID} .pfp`);
        status.style.opacity = 1;
    }
})

socket.on("unreadyAllPlayers", (hostID) => {
    if (hostID == myID && window.name != "answerModifier"){
        const statuses = document.querySelectorAll(`#statuses .pfp`)
        statuses.forEach((status) => status.style.opacity = 0.4);
    }
})

socket.on("updateScores", (players, hostID) => {
    if (hostID == myID && window.name == "answerModifier"){
        updateScores(players);
    }
})

socket.on("revealFinalScores", (players) => {
    revealFinalScores(players);
})

socket.on("firstSoundAcquired", (ID) => {
    if (ID == myID){
        chainMessages([ "SHHHH you have discovered a HIDDEN mechanic: audios!",
                        "You will collect new sounds throughout the game by fulfilling various secret criteria.",
                        "Once acquired, you may play the audio at the time of your choosing.",
                        "Click on the new audio menu below your abilities to check out your collection.",
                        "You only get ONE use of your sounds, so make sure to use them at the most (in?)opportune time."],
                        0, bodyElement, "soundExplanations", 3000);
        addSoundMenu();
    }
})

socket.on("sendHostSound", (soundDescription, ID, playerName, hostID) => {
    if (hostID == myID && window.name != "answerModifier"){
        // play appropriate sound
        let path = undefined;
        let customized = false;
        if (soundDescription == "To complain"){
            const soundNum = Math.floor(Math.random()*4);
            switch (soundNum){
                case 0:
                    path = "/static/audios/biasedBeyondBelief.m4a";
                    break;
                case 1:
                    path = "/static/audios/gameIsRigged.m4a";
                    break;
                case 2:
                    path = "/static/audios/iWasCheated.m4a";
                    break;
                case 3:
                    path = "/static/audios/totallyUnfair.m4a";
                    break;
            }
        }
        else if (soundDescription == "Encouragement"){
            const soundNum = Math.floor(Math.random()*2);
            switch (soundNum){
                case 0:
                    path = "/static/audios/saveMe.mp3";
                    break;
                case 1:
                    customized = true;
                    const customizedNum = Math.floor(Math.random()*4);
                    switch (customizedNum){
                        case 0:
                            path = "/static/audios/soManyPoints.m4a";
                            break;
                        case 1:
                            path = "/static/audios/isGonnaDoWell.m4a";
                            break;
                        case 2:
                            path = "/static/audios/needsOurPrayers.m4a";
                            break;
                        case 3:
                            path = "/static/audios/isGonnaWin.m4a";
                            break;
                    }  
            }
        }
        else if (soundDescription == "Slowpokes to hurry up"){
            path = "/static/audios/hurryUp.mp3";
        }
        else if (soundDescription == "To brag"){
            const soundNum = Math.floor(Math.random()*2);
            switch (soundNum){
                case 0:
                    path = "/static/audios/knockedOver.mp3";
                    break;
                case 1:
                    path = "/static/audios/stableGenius.mp3";
                    break;
            }
        }

        const playerIcon = document.getElementById(ID);
        const playingSound = document.createElement("img");
        playingSound.src = "/static/icons/sounds.svg";

        const audio = new Audio(path);
        audio.addEventListener('ended', () => {
            playingSound.remove();
        });
        if (customized && path){
            const utterance = new SpeechSynthesisUtterance(playerName);
            utterance.addEventListener("start", () => {
                playerIcon.appendChild(playingSound);
            })
            utterance.addEventListener("end", () => {
                audio.play();
            })
            window.speechSynthesis.speak(utterance);
        }
        else if (path){
            audio.addEventListener('playing', () => {
                playerIcon.appendChild(playingSound);
            });
            audio.play();
        }
    }
});

////// HOST & PLAYER events
socket.on("startTrivia", (players, roundDetails, gameDetails) => {
    if (gameDetails.hostID == myID && window.name != "answerModifier"){
        setUpHostDisplay(players, roundDetails, gameDetails);
    }
    else if (window.name != "answerModifier"){
        setUpPlayerDisplay()
    }
});

socket.on("nextQuestion", (question, img, additionalInfo, abilitiesToUse, hostID) => {
    const elementsToRemove = document.querySelectorAll(`.removeEOR`);
    elementsToRemove.forEach((element) => {
        element.remove();
    })

    if (hostID == myID && window.name != "answerModifier"){
        displayQuestion(question, img);
        const questionNum = document.querySelector(`#progress .currentNum`);
        questionNum.textContent = Number(questionNum.textContent) + 1;
        updateAbilityAvailability(abilitiesToUse);
    }
    else if (window.name != "answerModifier"){
        readyNewSubmission();
        displayAdditionalInfo(additionalInfo);
    }
});

socket.on("sendAnswerChoices", (answers, hostID) => {
    if (hostID == myID && window.name != "answerModifier"){
        hostDisplayAnswers(answers);
    }
    else if (window.name != "answerModifier"){
        playerDisplayAnswers(answers);
    }
});

socket.on("killLobby", () => {
    firstTimePlayerSetup();
    const me = document.getElementById("me");
    messagePopUp("The lobby you were in has been abandoned.", me, "", 5000, false);
})
////// PLAYER functions
async function displayPfp(file) {
    const compressedFile = await imageCompression(file, {maxSizeMB: 0.5});
    const pfpPreview = document.querySelector(`.preview.pfp`);
    
    const reader = new FileReader();
    reader.addEventListener("load", () => {
        pfpPreview.src = reader.result;  
    });
    reader.readAsDataURL(compressedFile);
}

function firstTimePlayerSetup(){
    document.body.innerHTML = "";

    const becomeHost = document.createElement("button");
    becomeHost.textContent = "Become New Host";
    becomeHost.id = "becomeHost";
    becomeHost.addEventListener("click", () => {
        socket.emit("createHost", myID);
    })

    const playerSetup = document.createElement("div");
    playerSetup.id = "me";

    const imgEntry = document.createElement("input");
    imgEntry.type = "file";
    imgEntry.accept = "image";
    imgEntry.capture = "user";
    imgEntry.id = "imgEntry";

    const imgEntryUI = document.createElement("label");
    imgEntryUI.setAttribute("for", "imgEntry");
    imgEntryUI.classList.add("imgEntry", "pfp");
    const imgEntryPromptIcon = document.createElement("img");
    imgEntryPromptIcon.src = "/static/icons/cameraIcon.svg";
    imgEntryPromptIcon.classList.add("icon");
    const pfpPreview = document.createElement("img");
    pfpPreview.classList.add("preview", "pfp");
    pfpPreview.style.display = "none";

    imgEntryUI.appendChild(imgEntryPromptIcon);
    imgEntryUI.appendChild(pfpPreview);

    imgEntry.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            imgEntryPromptIcon.remove();
            pfpPreview.style.display = "block";
            displayPfp(file);
        }
    });

    const nameEntry = document.createElement("input");
    nameEntry.classList.add("name");
    nameEntry.type = "text";
    nameEntry.placeholder = "Username";
    nameEntry.maxLength = 30;

    const codeEntry = document.createElement("input");
    codeEntry.type = "text";
    codeEntry.id = "roomCodeEntry";
    codeEntry.placeholder = "Room Code";
    codeEntry.maxLength = 4;
    codeEntry.setAttribute("autocapitalize", "characters");

    const joinBtn = document.createElement("button");
    joinBtn.classList.add("submit");
    joinBtn.textContent = "Join";
    joinBtn.addEventListener("click", () => {
        const pfpPreview = document.querySelector(`#me img.preview`);
        const me = document.getElementById("me");
        if (codeEntry.value == ""){
            messagePopUp("Enter the room code!", me, "noPfpError", 1500, false)
        }
        else if (pfpPreview.src == ""){
            messagePopUp("Add a profile picture first!", me, "noPfpError", 1500, false);
        }
        else if (nameEntry.value == ""){
            messagePopUp("Add a name first!", me, "noNameError", 1500, false);
        }
        else{
            socket.emit("playerJoined", nameEntry.value, myID, pfpPreview.src, codeEntry.value.toUpperCase());
        }
    })

    playerSetup.appendChild(imgEntryUI);
    playerSetup.appendChild(imgEntry);
    playerSetup.appendChild(nameEntry);
    playerSetup.appendChild(codeEntry);
    playerSetup.appendChild(joinBtn);

    bodyElement.appendChild(becomeHost);
    bodyElement.appendChild(playerSetup);
}

function fillInPlayerInfo(player){
    const imageEntryPromptIcon = document.querySelector(`#me .icon`);
    imageEntryPromptIcon.remove();
    const pfpPreview = document.querySelector(`.preview.pfp`);
    pfpPreview.src = player.playerImg;
    pfpPreview.style.display = "block";
    const name = document.querySelector(`#me .name`);
    name.value = player.playerName;
}

function waitingInLobby(){
    const roomCodeEntry = document.getElementById("roomCodeEntry");
    roomCodeEntry.remove();
    const joinButton = document.querySelector(`#me .submit`);
    joinButton.textContent = "Update";
    const me = document.getElementById("me");
    messagePopUp("You have successfully connected to the lobby. Remain here until trivia starts.", me, "inLobbyMsg", 0, false);
}

function setUpPlayerDisplay(){
    document.body.innerHTML = "";

    const menus = document.createElement("div");
    menus.id = "menus";

    const abilities = document.createElement("img");
    abilities.src = "/static/icons/abilities.svg";
    abilities.id = "abilities";
    abilities.classList.add("icon");
    abilities.addEventListener("click", () => {
        const abilityPopUp = document.querySelector(`#abilityPopUp`)
        if (!abilityPopUp){
            socket.emit("requestAbilities", myID);
        } 
        else{
            abilityPopUp.remove();
        }
    })

    const additionalInfo = document.createElement("img");
    additionalInfo.src = "static/icons/additionalInfo.svg";
    additionalInfo.id = "additionalInfo";

    const trivia = document.createElement("div");
    trivia.id = "trivia";

    const guessDiv = document.createElement("div");
    guessDiv.classList.add("guess");
    const userGuess = document.createElement("input");
    userGuess.type = "text";
    userGuess.maxLength = 30;
    const submitBtn = document.createElement("button");
    submitBtn.id = "makeInitialGuess";
    submitBtn.textContent = "Lock in";

    submitBtn.addEventListener("click", () => {
        if (userGuess.value != ""){
            socket.emit("madeFirstGuess", myID, userGuess.value);
            userGuess.placeholder = "Submitted!";
            userGuess.disabled = true;
            userGuess.value = "";  
            submitBtn.disabled = true;
        }
    })

    const answersDiv = document.createElement("div");
    answersDiv.classList.add("answers");
    const answerChoices = document.createElement("div");
    answerChoices.classList.add("answerChoices");

    const confirmFinalAnswer = document.createElement("button");
    confirmFinalAnswer.textContent = "Confirm";
    confirmFinalAnswer.id = "confirmFinalAnswer"
    confirmFinalAnswer.addEventListener("click", () => {
        const selectedAnswer = document.getElementById("finalAnswer");
        if (selectedAnswer){
            socket.emit("choseFinalAnswer", myID, selectedAnswer.textContent-1);
            const answersDOM = answerChoices.children;
            const answers = [...answersDOM];
            answers.forEach((answer) => {
                answer.disabled = true;
            });
            confirmFinalAnswer.disabled = true;
        }
    })
    answersDiv.appendChild(answerChoices);
    answersDiv.appendChild(confirmFinalAnswer);

    guessDiv.appendChild(userGuess);
    guessDiv.appendChild(submitBtn);
    trivia.appendChild(guessDiv);
    trivia.appendChild(answersDiv);

    menus.appendChild(abilities);

    bodyElement.appendChild(menus);
    bodyElement.appendChild(additionalInfo);
    bodyElement.appendChild(trivia);
}

function addSoundMenu(){
    const menuExists = document.querySelector(`#sounds`);
    if (!menuExists){
        const sounds = document.createElement("img");
        sounds.src = "/static/icons/sounds.svg"
        sounds.id = "sounds";
        sounds.classList.add("icon");
        sounds.addEventListener("click", () => {
            const soundsPopUp = document.querySelector(`#soundsPopUp`)
            if (!soundsPopUp){
                socket.emit("requestSounds", myID);
            }
            else{
                soundsPopUp.remove();
            }
        })
        const menus = document.getElementById("menus");
        menus.appendChild(sounds);
    }  
}

function readyNewSubmission(){
    const userGuess = document.querySelector(`.guess input`);
    const submitBtn = document.querySelector(`#makeInitialGuess`);
    const confirmFinalAnswer = document.querySelector(`#confirmFinalAnswer`);

    userGuess.placeholder = "";
    userGuess.disabled = false;
    submitBtn.disabled = false;
    confirmFinalAnswer.disabled = false;

    toggleVisibleSelections();
}

function displayAdditionalInfo(additionalInfo){
    const oldInfo = document.querySelector(`#additionalInfo`);
    const newInfo = oldInfo.cloneNode(true);
    oldInfo.parentNode.replaceChild(newInfo, oldInfo);
    newInfo.setAttribute("title", additionalInfo);
    newInfo.addEventListener("click", () => {
        messagePopUp(additionalInfo, bodyElement, "additionalInfoMessage", 3000, true);
    })
}

function addDoublePtsIcon(){
    const doublePtsIcon = document.createElement("img");
    doublePtsIcon.src = "/static/icons/doublePts.svg";
    doublePtsIcon.classList.add("doublePtsIcon", "removeEOR");
    bodyElement.appendChild(doublePtsIcon);
}

function showAllSubmissions(rawAnswers){
    const rawAnswerList = document.createElement("ul");
    rawAnswerList.id = "rawAnswers"
    rawAnswerList.classList.add("removeEOR");
    
    rawAnswers.forEach((answer) => {
        const answerDOM = document.createElement("li");
        answerDOM.textContent = answer;
        rawAnswerList.appendChild(answerDOM);
    })
    bodyElement.appendChild(rawAnswerList);
}

function playerDisplayAnswers(answers){
    const answersDiv = document.querySelector(`div.answers`);
    const answerChoices = document.querySelector(`div.answerChoices`);
    answerChoices.replaceChildren();

    for (let i = 0; i < answers.length; i++){
        const answer = document.createElement("button");
        answer.textContent = i+1;
        answer.addEventListener("click", () => {
            const previousSelection = document.getElementById("finalAnswer");
            if (previousSelection){
                previousSelection.id = "";
            }
            answer.id = "finalAnswer";
        })
        answerChoices.appendChild(answer);
    }

    toggleVisibleSelections();
}

function eliminatePotentialAnswer(index){
    const answerChoices = document.querySelector(`#trivia .answers .answerChoices`);
    const answersDOM = answerChoices.children;
    const answers = [...answersDOM];
    const answerButton = answers.find((answer) => answer.textContent == index + 1);
    answerButton.disabled = true;
}

function toggleVisibleSelections(){
    const guessDiv = document.querySelector(`div.guess`);
    const answersDiv = document.querySelector(`div.answers`);

    if (guessDiv.style.display == "grid"){
        guessDiv.style.display = "none";
        answersDiv.style.display = "grid";
    }
    else{
        guessDiv.style.display = "grid";
        answersDiv.style.display = "none";
    }
}

function displayAbility(abilityName, hasAbility, hasUsedAnAbility, canUseAbility, abilityPopUp, description){
    const abilityDiv = document.createElement("div");
    abilityDiv.setAttribute("title", description);

    const abilityIcon = document.createElement("img");
    abilityIcon.src = `/static/icons/${abilityName}.svg`;
    const abilityStatus = document.createElement("p");
    const abilityButton = document.createElement("button");

    abilityButton.addEventListener("click", () => {
        socket.emit("useAbility", abilityName, myID);
        const abilityPopUp = document.getElementById("abilityPopUp");
        abilityPopUp.remove();
    })

    if (!hasAbility){
        abilityStatus.textContent = "Used";
        abilityDiv.classList.add("used");
        abilityButton.textContent = "USED";
        abilityButton.disabled = true;
    }
    else if (!canUseAbility || hasUsedAnAbility){
        abilityStatus.textContent = "Inactive";
        abilityDiv.classList.add("inactive")
        abilityButton.textContent = "USE";
        abilityButton.disabled = true;
    }
    else{
        abilityStatus.textContent = "Active";
        abilityDiv.classList.add("active");
        abilityButton.textContent = "USE";
    }

    abilityDiv.appendChild(abilityIcon);
    abilityDiv.appendChild(abilityStatus);
    abilityDiv.appendChild(abilityButton);

    abilityPopUp.appendChild(abilityDiv);
}

function messagePopUp(messageText, appendTo, className, lengthMS, removeAtEndOfRound){
    const existingMessage = appendTo.querySelector(`.message`);
    if (!existingMessage){
        const message = document.createElement("p");
        message.textContent = messageText;
        message.classList.add("message");
        if (className != ""){
            message.classList.add(className);
        }
        appendTo.appendChild(message);
        if (lengthMS > 0){
            setTimeout(() => {
                message.remove();
            }, lengthMS);
        }
        if (removeAtEndOfRound){
            message.classList.add("removeEOR");
        }
        return message;
    }
}

function chainMessages(messages, messageNum, appendTo, classToAdd, lengthMS){
    const message = messagePopUp(messages[messageNum], appendTo, classToAdd, 0, false);    
    setTimeout(() => {
        message.remove();
        if (messages.length > messageNum+1){
            chainMessages(messages, messageNum+1, appendTo, classToAdd, lengthMS);
        }
    }, lengthMS)


    /*
    document.addEventListener("click", (event) => {
        if (!message.contains(event.target)) {
            message.remove();
            if (messages.length > messageNum+1){
                chainMessages(messages, messageNum+1, appendTo);
            }
        }
    });

        message.addEventListener("click", () => {
        message.remove();
        if (messages.length > messageNum+1){
            chainMessages(messages, messageNum+1, appendTo, classToAdd, lengthMS);
        }
    })
    */
}
////// HOST functions
function displayLobby(roomCode, players){
    document.body.innerHTML = "";
    addManualAnswerModifier();
    addHeader();

    const lobby = document.createElement("div");
    lobby.id = "lobby";
    bodyElement.appendChild(lobby);

    const abandonLobby = document.createElement("button");
    abandonLobby.textContent = "Abandon Lobby";
    abandonLobby.id = "abandonLobby";
    abandonLobby.addEventListener("click", () => {
        socket.emit("abandonLobby", myID);
    })
    lobby.appendChild(abandonLobby);

    const codeDiv = document.createElement("div");
    codeDiv.classList.add("roomCode");
    const codeLabel = document.createElement("p");
    codeLabel.textContent = "Room Code:";
    const joinCode = document.createElement("p");
    joinCode.textContent = roomCode;
    joinCode.id = "roomCode";
    codeDiv.appendChild(codeLabel);
    codeDiv.appendChild(joinCode);
    lobby.appendChild(codeDiv);
    
    const playersDiv = document.createElement("div");
    playersDiv.id = "playersDiv"
    lobby.appendChild(playersDiv);

    for (let i = 0; i < players.length; i++){
        displayPlayerInLobby(players[i], playersDiv)
    }

    if (players.length > 1){
        addStartTriviaButton();
    }
}

function addHeader(){
    const header = document.createElement("div");
    header.id = "header";
    bodyElement.appendChild(header);

    const title = document.createElement("p")
    title.classList.add("title");
    title.textContent = "Trivia"
    header.appendChild(title);

    addQuote("\"Totally unfair\"", 1);
    addQuote("\"I was cheated\"", 2);
    addQuote("\"Game is rigged\"", 3);
    addQuote("\"A trivial experience\"", 4);
    addQuote("\"Biased beyond belief\"", 5);
}

function displayPlayerInLobby(displayedPlayer, playersDiv){
    const player = document.createElement("div");
    player.classList.add("player", displayedPlayer.playerID);

    const img = document.createElement("img");
    img.src = displayedPlayer.playerImg;
    img.classList.add("pfp");

    const name = document.createElement("p");
    name.textContent = displayedPlayer.playerName;
    name.classList.add("name");

    player.appendChild(img);
    player.appendChild(name);
    playersDiv.appendChild(player);

    const allPlayers = document.querySelectorAll(`#lobby .player`);
    if (allPlayers.length > 1){
        addStartTriviaButton();
    }
}

function addStartTriviaButton(){
    const lobby = document.getElementById("lobby");
    const existingButton = lobby.querySelector(`.startTrivia`);
    if (!existingButton){
        const startTriviaButton = document.createElement("button");
        startTriviaButton.classList.add("startTrivia");
        startTriviaButton.textContent = "Trivia Time!";
        startTriviaButton.addEventListener("click", () => {
            const attemptStart = confirm("Are you sure? Additional players cannot be added later.");
            if (attemptStart){
                socket.emit("attemptStart", myID);
            }
        })
        lobby.appendChild(startTriviaButton);
    }   
}

function setUpHostDisplay(players, roundDetails, gameDetails){
    document.body.innerHTML = "";
    addManualAnswerModifier();
    addHeader();
    const title = document.querySelector(`#header .title`);
    title.style.visibility = "hidden";

    const progress = document.createElement("div");
    progress.id = "progress";
    const questionNum = document.createElement("p");
    questionNum.textContent = roundDetails.questionNum;
    questionNum.classList.add("currentNum");
    const totalNum = document.createElement("p");
    totalNum.textContent = ` / ${gameDetails.totalQuestions}`;
    progress.appendChild(questionNum);
    progress.appendChild(totalNum);

    const activeAbilities = document.createElement("div");
    activeAbilities.id = "activeAbilities";
    addAbility("eliminateOne", activeAbilities);
    addAbility("continentCheck", activeAbilities);
    addAbility("doublePts", activeAbilities);
    addAbility("seeAllSubmissions", activeAbilities);

    const playerStatuses = document.createElement("div");
    playerStatuses.id = "statuses";
    for (let i = 0; i < players.length; i++){
        const statusDiv = document.createElement("div");
        statusDiv.id = players[i].playerID
        const statusIcon = document.createElement("img");
        statusIcon.classList.add("pfp");
        statusIcon.src = players[i].playerImg;
        statusDiv.appendChild(statusIcon);
        playerStatuses.appendChild(statusDiv);
    }

    const trivia = document.createElement("div");
    trivia.id = "trivia";

    const question = document.createElement("div");
    question.classList.add("question");
    const questionText = document.createElement("p");
    const questionImg = document.createElement("img");
    question.appendChild(questionText);
    question.appendChild(questionImg);
    trivia.appendChild(question);

    const answersDiv = document.createElement("div");
    answersDiv.classList.add("answers");
    trivia.appendChild(answersDiv);

    bodyElement.appendChild(progress);
    bodyElement.appendChild(activeAbilities);
    bodyElement.appendChild(playerStatuses);
    bodyElement.appendChild(trivia);

    updateAbilityAvailability(gameDetails.abilitiesToUse);
}

function displayQuestion(question, img){
    const questionImg = document.querySelector(`.question img`);
    questionImg.style.opacity = 1;
    questionImg.src = img;

    const answersDiv = document.querySelector(`div.answers`);
    answersDiv.style.display = "none";

    const questionText = document.querySelector(`.question p`);
    questionText.textContent = question;
}

function hostDisplayAnswers(answers){
    const questionImg = document.querySelector(`.question img`);
    questionImg.style.opacity = 0.2;

    const allAnswers = document.querySelector(`div.answers`);
    allAnswers.replaceChildren();
    for (let i = 0; i < answers.length; i++){
        const answerDiv = document.createElement("div");
        answerDiv.classList.add("answerChoice");

        const answerNum = document.createElement("p");
        answerNum.textContent = `${i+1}.`;
        answerNum.classList.add("answerNum");
        answerDiv.appendChild(answerNum);

        const answerText = document.createElement("p");
        answerText.textContent = `${answers[i]}`;
        answerText.classList.add("answer");
        answerDiv.appendChild(answerText);

        const chosenByDiv = document.createElement("div");
        chosenByDiv.classList.add("chosenBy");
        answerDiv.appendChild(chosenByDiv);

        const authors = document.createElement("div");
        authors.classList.add("authors");
        answerDiv.appendChild(authors);

        allAnswers.appendChild(answerDiv)
    }
    allAnswers.style.display = "grid";
}

function updateStatuses(players){
    const statuses = document.querySelectorAll(`#statuses .pfp`)
    for (let i = 0; i < players.length; i++){
        if (!players[i].isReady){
            statuses[i].style.opacity = 0.4;
        }
    }
}

function revealAnswers(players, answer){
    const answersDOM = document.querySelectorAll(`div.answers .answerChoice p.answer`);
    const answers = [...answersDOM];
    const stall = players.length;

    // display players' final answers
    for (let icons = 0; icons < players.length; icons++){
        setTimeout(() => {
            const guessedIcon = document.createElement("img");
            guessedIcon.src = players[icons].playerImg;
            guessedIcon.classList.add("pfp");
            const chosenAnswer = answers.find((selectedAnswer) => selectedAnswer.textContent == players[icons].finalAnswer);
            const chosenByDiv = chosenAnswer.parentElement.querySelector(`.chosenBy`);
            chosenByDiv.appendChild(guessedIcon);
            playSound("/static/audios/pop.mp3");
        }, icons*1000);            
    }

    // display who wrote each guess
    let losingPlayer = players.reduce((loser, current) => current.pts < loser.pts ? current : loser);
    const checkUniqueness = players.filter(player => player.pts == losingPlayer.pts);
    if (checkUniqueness.length > 1){
        losingPlayer = undefined;
    }
    for (let authors = 0; authors < players.length; authors++){
        setTimeout(() => {
            const author = document.createElement("p");
            author.textContent = players[authors].playerName;
            if (players[authors] == losingPlayer){
                playSound("/static/audios/laugh.mp3");
                author.id = "cursedLabel";
            }
            const initialGuess = answers.find((writtenAnswer) => writtenAnswer.textContent == players[authors].initialGuess);
            const authorsDiv = initialGuess.parentElement.querySelector(`.authors`);
            authorsDiv.appendChild(author);
        }, stall*1000 + authors*2000);     
    }

    // highlight correct answer
    setTimeout(() => {
        playSound("/static/audios/ding.mp3");
        const correctLabel = document.createElement("p");
        correctLabel.textContent = "ANSWER";
        correctLabel.id = "correctLabel";
        const correctAnswer = answers.find((correctAnswer) => correctAnswer.textContent == answer);
        const authorsDiv = correctAnswer.parentElement.querySelector(`.authors`);
        authorsDiv.appendChild(correctLabel);
    }, stall*3000); 

    setTimeout(() => {
        socket.emit("finishedRound", myID);
    }, 3000 + stall*3000); 
}

function displayScores(players){
    const scoreDiv = document.createElement("div");
    scoreDiv.id = "scores";

    players.forEach((player) => {
        const playerDiv = document.createElement("div");
        const name = document.createElement("p");
        name.textContent = player.playerName;
        const score = document.createElement("p");
        score.textContent = player.pts;

        playerDiv.appendChild(name);
        playerDiv.appendChild(score);
        scoreDiv.appendChild(playerDiv);
    })
    bodyElement.appendChild(scoreDiv);
}

function updateScores(players){
    const scoreDiv = document.getElementById("scores");
    const scoresDOM = scoreDiv.children;
    const scores = [...scoresDOM];
    scores.forEach((score) => {
        const name = score.firstChild;
        const pts = score.lastChild;
        const player = players.find((player) => player.playerName == name.textContent);
        pts.textContent = player.pts;
    })
}

function revealFinalScores(players){
    const finalScores = document.createElement("div");
    finalScores.id = "finalScores";

    players.forEach((player) => {
        const playerDiv = document.createElement("div");
        playerDiv.classList.add("player");

        const playerPtsNum = document.createElement("p");
        playerPtsNum.textContent = player.pts;
        setTimeout(() => {
            playerPtsNum.style.visibility = "visible";
        }, 2 * player.pts *1000);

        const winner = players.reduce((winner, current) => current.pts > winner.pts ? current : winner);
        const vhsPerPt = 40 / winner.pts;

        const playerPtsBar = document.createElement("div");
        playerPtsBar.classList.add("bar");
        playerPtsBar.style.height = `${vhsPerPt * player.pts}vh`;
        playerPtsBar.style.animation = `revealScores ${2 * player.pts}s  ease-out forwards`;
        playerPtsBar.style.background = `url(${player.playerImg}) no-repeat center/cover`;
        const playerIcon = document.createElement("img");
        playerIcon.src = player.playerImg;
        playerIcon.classList.add("pfp");
        
        playerDiv.appendChild(playerPtsNum);
        playerDiv.appendChild(playerPtsBar);
        playerDiv.appendChild(playerIcon);
        finalScores.appendChild(playerDiv);   
    })

    const trivia = document.getElementById("trivia");
    trivia.replaceChildren(finalScores);
}

function addQuote(quoteText, quoteNum){
    const header = document.querySelector(`#header`);
    const quote = document.createElement("p");
    quote.classList.add("quote");
    
    if (quoteNum == 1){
        quote.classList.add("left");
    }
    else if (quoteNum == 2){
        quote.classList.add("right");
    }
    else{
        quote.classList.add("bottom");
    }

    quote.textContent = quoteText;
    header.appendChild(quote);
}

function addAbility(abilityName, abilitiesDiv){
    const ability = document.createElement("div");
    ability.classList.add(abilityName);

    const abilityIcon = document.createElement("img");
    abilityIcon.src = `/static/icons/${abilityName}.svg`;

    const abilityRounds = document.createElement("p");
    switch (abilityName){
        case 'eliminateOne': 
            abilityRounds.textContent = "ALL";
            break;
        case 'continentCheck':
            abilityRounds.textContent = "EVENS";
            break;
        case 'doublePts':
            abilityRounds.textContent = "10+";
            break;
        case 'seeAllSubmissions':
            abilityRounds.textContent = "5+";
            break;
    }
    

    ability.appendChild(abilityIcon);
    ability.appendChild(abilityRounds);
    abilitiesDiv.appendChild(ability);
}

function updateAbilityAvailability(abilitiesToUse){
    const abilities = document.querySelectorAll(`#activeAbilities div`);
    abilities.forEach((ability) => {
        if (abilitiesToUse[ability.classList[0]] == false){
            ability.firstChild.style.filter = `brightness(0) invert(0.5)`;
        }
        else{
            ability.firstChild.style.filter = ``;
        }
    })
}

function playSound(path){
    const audio = new Audio(path);
    audio.play();
}

function addManualAnswerModifier(){
    if (window.name != "answerModifier"){
        const openAnswerModifier = document.createElement("img");
        openAnswerModifier.src = "/static/icons/answerModifier.svg";
        openAnswerModifier.id = "openAnswerModifier";
        openAnswerModifier.addEventListener("click", () => {
            const existingWindow = window.open("", "answerModifier");
            if (!existingWindow || existingWindow.location.href == "about:blank"){
                //const manualAnswerModification = window.open("http://trivia-k294.onrender.com", "_blank", "width=600,height=400,resizable=yes,scrollbars=yes");
                const manualAnswerModification = window.open("http://localhost:5500", "_blank", "width=600,height=400,resizable=yes,scrollbars=yes");
                manualAnswerModification.name = "answerModifier";
                existingWindow.close();
            }
        });
    bodyElement.appendChild(openAnswerModifier);
    }
}

function displayAnswersToModify(players, correctAnswer){
    const answersToModify = document.createElement("div");
    answersToModify.id = "answersToModify";

    players.forEach((player) => {
        const answerDiv = document.createElement("div");
        
        const name = document.createElement("p");
        name.textContent = player.playerName;

        const answer = document.createElement("input");
        answer.value = player.initialGuess;

        answerDiv.appendChild(name);
        answerDiv.appendChild(answer);
        answersToModify.appendChild(answerDiv);
    })
    const answerDiv = document.createElement("div");
    const answer = document.createElement("input");
    answer.value = correctAnswer;
    answer.disabled = true;
    answerDiv.appendChild(answer);
    answersToModify.appendChild(answerDiv);

    const submitBtn = document.createElement("button");
    submitBtn.textContent = "Modify";
    submitBtn.addEventListener("click", () => {
        const modifiedAnswers = [];
        const answersDOM = document.querySelectorAll(`#answersToModify input`);
        const answers = [...answersDOM];
        answers.forEach((answer) => {
            modifiedAnswers.push(answer.value);
        });
        
        socket.emit("getModifiedAnswers", modifiedAnswers, myID);
        answersToModify.remove();
    })
    answersToModify.appendChild(submitBtn);

    bodyElement.appendChild(answersToModify);
}