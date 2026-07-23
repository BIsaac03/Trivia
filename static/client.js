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
    //console.log("connected");
});

socket.on("reconnection", (hostID, gameState, players) => {
    console.log(players);
    // restore HOST state
    if (hostID == myID){
        if (!gameState.gameHasStarted){
            displayLobby(players);
        }
        else{
            setUpHostDisplay(players, gameState);
            updateStatuses(players);
            displayQuestion(gameState.question);
            if (gameState.allAnswers.length > 0){
                hostDisplayAnswers(gameState.allAnswers);
            }
        }
    }
    // retore PLAYER state
    else{
        // joining a lobby
        if (!gameState.gameHasStarted){
            const alreadyJoined = players.find(player => player.playerID == myID);
            if (alreadyJoined == undefined){
                firstTimePlayerSetup();
            }
            else{
                firstTimePlayerSetup();
                fillInPlayerInfo(alreadyJoined);
                waitingInLobby(alreadyJoined);
            }
        }

        // joining an ongoing game
        else{
            const me = players.find(player => player.playerID == myID);
            if (me != undefined){
                setUpPlayerDisplay();
                if (me.initialGuess == ''){
                    console.log("empty");
                    readyNewSubmission();
                }
                else if (me.finalAnswer == ''){
                    if (gameState.allAnswers.length == 0){
                        const userGuess = document.querySelector(`.guess input`);
                        const submitBtn = document.querySelector(`#makeInitialGuess`);

                        userGuess.placeholder = "Submitted!";
                        userGuess.disabled = true;
                        userGuess.value = "";  
                        submitBtn.disabled = true;
                    }
                    else{
                        console.log(gameState.allAnswers);
                        playerDisplayAnswers(gameState.allAnswers);
                        toggleVisibleSelections();
                    }
                    
                }
                else{
                    playerDisplayAnswers(gameState.allAnswers);
                    toggleVisibleSelections();
                    const answerChoices = document.querySelector(`.answerChoices`);
                    const confirmFinalAnswer = document.getElementById("confirmFinalAnswer");

                    const answersDOM = answerChoices.children;
                    const answers = [...answersDOM];
                    answers.forEach((answer) => {
                        answer.disabled = true;
                        console.log(me.finalAnswer);
                        console.log(answer.textContent);
                        if (gameState.allAnswers[answer.textContent-1] == me.finalAnswer){
                            console.log("match")
                            answer.id = "finalAnswer";
                        }
                    });
                    confirmFinalAnswer.disabled = true;
                }
            }

            // !! otherwise, restrict all functionality
            else{

            }
        }
    }   
});


////// PLAYER events
socket.on("newConnection", () => {
    firstTimePlayerSetup();
});

socket.on("waitingInLobby", (me, isFirstTimeJoin) => {
    waitingInLobby(me);
})

socket.on("displayAbilities", (myAbilities, currentlyAvailableAbilities) => {
    const abilityPopUp = document.createElement("div");
    abilityPopUp.id = "abilityPopUp";

    displayAbility("eliminateOne", myAbilities.eliminateOne, currentlyAvailableAbilities.eliminateOne, abilityPopUp,
                    "Pick two answers. An incorrect one is removed.");
    displayAbility("secondSelection", myAbilities.secondSelection, currentlyAvailableAbilities.secondSelection, abilityPopUp,
                    "Select a second answer. If EITHER is cursed, you will earn no points.");
    displayAbility("doublePts", myAbilities.doublePts, currentlyAvailableAbilities.doublePts, abilityPopUp,
                    "Double the points you earn this round.\nPoints earned/lost from cursing are not doubled.");
    displayAbility("seeAllSubmissions", myAbilities.seeAllSubmissions, currentlyAvailableAbilities.seeAllSubmissions, abilityPopUp,
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

    mySounds.forEach(sound => {
        const soundDiv = document.createElement("div");
        const soundDescription = document.createElement("p");
        const soundNum = document.createElement("p");
        const soundButton = document.createElement("button");

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
        soundDiv.appendChild(soundButton);
        soundsPopUp.appendChild(soundDiv);
    });

    if (mySounds.length == 0){
        const noSoundsMessage = document.createElement("p");
        noSoundsMessage.textContent = "You have no sounds! Do cool things to earn more.";
        soundsPopUp.appendChild(noSoundsMessage);

        setTimeout(() => {
            soundsPopUp.remove();
        }, 3000);
    }

    document.addEventListener("click", (event) => {
        if (!soundsPopUp.contains(event.target)) {
            soundsPopUp.remove();
        }
    });

    bodyElement.appendChild(soundsPopUp);
});

socket.on("eliminateAnAnswer", () => {
    // !! let user pick two answers, eliminate an incorrect one
});

socket.on("forceSelectTwoAnswers", () => {
    // !! make user select a second answer
});

socket.on("showAllSubmissions", () => {
    // !! reveal unedited list of all initial guesses (+ correct answer)
});

socket.on("illegalAbilityUse", () => {
    const timingErrorPopUp = document.createElement("p");
    timingErrorPopUp.textContent = "You cannot use this ability until all players have submitted their initial guesses.";
    timingErrorPopUp.classList.add("abilityError");
    bodyElement.appendChild(timingErrorPopUp);
    setTimeout(() => {
        timingErrorPopUp.remove();
    }, 4000); 
    
});
////// HOST events
socket.on("hostSetUp", () => {
    displayLobby([]);
})

socket.on("playerJoined", (newPlayer, hostID) => {
    if (hostID == myID){
        const playersDiv = document.getElementById("playersDiv");
        displayPlayerInLobby(newPlayer, playersDiv);
    }
});

socket.on("playerModified", (modifiedPlayer, hostID) => {
    if (hostID == myID){
        const name = document.querySelector(`.${modifiedPlayer.playerID} .name`)
        name.textContent = modifiedPlayer.playerName;

        const img = document.querySelector(`.${modifiedPlayer.playerID} .pfp`)
        img.src = modifiedPlayer.playerImg;
    }
});

socket.on("revealAnswer", (players, answer, hostID) => {
    if (hostID == myID){
        revealAnswers(players, answer);
    }
})

socket.on("playerReady", (playerID, hostID) => {
    if (hostID == myID){
        const status = document.querySelector(`#${playerID}`);
        status.style.opacity = 1;
    }
})

socket.on("unreadyAllPlayers", (hostID) => {
    if (hostID == myID){
        const statuses = document.querySelectorAll(`#statuses .pfp`)
        statuses.forEach((status) => status.style.opacity = 0.4);
    }
})

socket.on("sendHostSound", (soundDescription, hostID) => {
    if (hostID == myID){
        console.log(soundDescription);
        // play appropriate sound
        let path = undefined;
        if (soundDescription == "complain"){
            const soundNum = Math.floor(Math.random()*4);
            switch (soundNum){
                case 0:
                    path = "/static/audios/biasedBeyondBelief.m4a";
                case 1:
                    path = "/static/audios/gameIsRigged.m4a";
                case 2:
                    path = "/static/audios/iWasCheated.m4a";
                case 3:
                    path = "/static/audios/totallyUnfair.m4a";
            }
        }
        else if (soundDescription == "encourage"){
            path = "/static/audios/saveMe.mp3";
        }

        if (path != undefined){
            const audio = new Audio(path);
            audio.play();
        }

        //const utterance = new SpeechSynthesisUtterance(soundDescription);
        //window.speechSynthesis.speak(utterance);
    }
})

////// HOST & PLAYER events
socket.on("startTrivia", (players, gameState, hostID) => {
    if (hostID == myID){
        setUpHostDisplay(players, gameState);
    }
    else{
        setUpPlayerDisplay()
    }
});

socket.on("nextQuestion", (question, hostID) => {
    if (hostID == myID){
        displayQuestion(question);
        const questionNum = document.querySelector(`#progress .currentNum`);
        questionNum.textContent = Number(questionNum.textContent) + 1;
    }
    else{
        readyNewSubmission();
    }
});

socket.on("sendAnswerChoices", (answers, hostID) => {
    if (hostID == myID){
        hostDisplayAnswers(answers);
    }
    else{
        playerDisplayAnswers(answers);
    }
});

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
    nameEntry.maxLength = 30;

    const joinBtn = document.createElement("button");
    joinBtn.classList.add("submit");
    joinBtn.textContent = "Join";
    joinBtn.addEventListener("click", () => {
        const pfpPreview = document.querySelector(`#me img.preview`);
        if (nameEntry.value != "" && pfpPreview.src != "") {
            joinBtn.textContent = "Update"
            socket.emit("playerJoined", nameEntry.value, myID, pfpPreview.src);
        }
    })

    playerSetup.appendChild(imgEntryUI);
    playerSetup.appendChild(imgEntry);
    playerSetup.appendChild(nameEntry);
    playerSetup.appendChild(joinBtn);

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
    const joinButton = document.querySelector(`#me .submit`);
    joinButton.textContent = "Update";
}

function waitingInLobby(me){
    const existingMessage = document.querySelector(`.inLobbyMessage`);
    if (existingMessage == undefined){
        const message = document.createElement("p");
        message.textContent = "You have successfully connected to the lobby. Remain here until trivia starts."
        message.classList.add("inLobbyMessage");
        const me = document.getElementById("me");
        me.appendChild(message);
    } 
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
        if (abilityPopUp == undefined){
            socket.emit("requestAbilities", myID);
        } 
        else{
            abilityPopUp.remove();
        }
    })

    const sounds = document.createElement("img");
    sounds.src = "/static/icons/sounds.svg"
    sounds.id = "sounds";
    sounds.classList.add("icon");
    sounds.addEventListener("click", () => {
        const soundsPopUp = document.querySelector(`#soundsPopUp`)
        if (soundsPopUp == undefined){
            socket.emit("requestSounds", myID);
        }
        else{
            soundsPopUp.remove();
        }
    })

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
        socket.emit("madeFirstGuess", myID, userGuess.value);
        userGuess.placeholder = "Submitted!";
        userGuess.disabled = true;
        userGuess.value = "";  
        submitBtn.disabled = true;
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
        if (selectedAnswer != undefined){
            socket.emit("choseFinalAnswer", myID, selectedAnswer.textContent-1);
            const answersDOM = answerChoices.children;
            const answers = [...answersDOM];
            answers.forEach((answer) => {
                answer.disabled = true;
            });
            confirmFinalAnswer.disabled = true;
        }
    })
    answersDiv.appendChild(confirmFinalAnswer);
    answersDiv.appendChild(answerChoices);

    guessDiv.appendChild(userGuess);
    guessDiv.appendChild(submitBtn);
    trivia.appendChild(guessDiv);
    trivia.appendChild(answersDiv);

    menus.appendChild(abilities);
    menus.appendChild(sounds);

    bodyElement.appendChild(menus);
    bodyElement.appendChild(trivia);
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

function playerDisplayAnswers(answers){
    const answersDiv = document.querySelector(`div.answers`);
    const answerChoices = document.querySelector(`div.answerChoices`)
    answerChoices.replaceChildren();

    for (let i = 0; i < answers.length; i++){
        const answer = document.createElement("button");
        answer.textContent = i+1;
        answer.addEventListener("click", () => {
            const previousSelection = document.getElementById("finalAnswer");
            if (previousSelection != undefined){
                previousSelection.id = "";
            }
            answer.id = "finalAnswer";
        })
        answerChoices.appendChild(answer);
    }

    toggleVisibleSelections();
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

function displayAbility(abilityName, hasAbility, canUseAbility, abilityPopUp, description){
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
    else if (!canUseAbility){
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

////// HOST functions
function displayLobby(players){
    document.body.innerHTML = "";

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

    const lobby = document.createElement("div");
    lobby.id = "lobby";
    bodyElement.appendChild(lobby);
    
    const playersDiv = document.createElement("div");
    playersDiv.id = "playersDiv"
    lobby.appendChild(playersDiv);

    for (let i = 0; i < players.length; i++){
        displayPlayerInLobby(players[i], playersDiv)
    }

    // !! have button appear only after 2+ players have joined
    const startTriviaButton = document.createElement("button");
    startTriviaButton.classList.add("startTrivia");
    startTriviaButton.textContent = "Trivia Time!";
    startTriviaButton.addEventListener("click", () => {
        const attemptStart = confirm("Are you sure? Additional players cannot be added later.");
        if (attemptStart){
            socket.emit("attemptStart");
        }
    })

    lobby.appendChild(startTriviaButton);
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
}

function setUpHostDisplay(players, gameState){
    document.body.innerHTML = "";

    const progress = document.createElement("div");
    progress.id = "progress";
    const questionNum = document.createElement("p");
    questionNum.textContent = gameState.questionNum;
    questionNum.classList.add("currentNum");
    const totalNum = document.createElement("p");
    totalNum.textContent = ` / ${gameState.totalQuestions}`;
    progress.appendChild(questionNum);
    progress.appendChild(totalNum);

    const activeAbilities = document.createElement("div");
    activeAbilities.id = "activeAbilities";
    addAbility("eliminateOne", activeAbilities);
    addAbility("secondSelection", activeAbilities);
    addAbility("doublePts", activeAbilities);
    addAbility("seeAllSubmissions", activeAbilities);

    const playerStatuses = document.createElement("div");
    playerStatuses.id = "statuses";
    for (let i = 0; i < players.length; i++){
        const statusIcon = document.createElement("img");
        statusIcon.classList.add("pfp");
        statusIcon.id = players[i].playerID
        statusIcon.src = players[i].playerImg;
        playerStatuses.appendChild(statusIcon);
    }

    const trivia = document.createElement("div");
    trivia.id = "trivia";

    const questionText = document.createElement("p");
    questionText.classList.add("question");
    trivia.appendChild(questionText);

    const answersDiv = document.createElement("div");
    answersDiv.classList.add("answers");
    trivia.appendChild(answersDiv);

    bodyElement.appendChild(progress);
    bodyElement.appendChild(activeAbilities);
    bodyElement.appendChild(playerStatuses);
    bodyElement.appendChild(trivia);
}

function displayQuestion(question){
    const answersDiv = document.querySelector(`div.answers`);
    answersDiv.style.display = "none";

    const questionText = document.querySelector(`p.question`);
    questionText.textContent = question;
}

function hostDisplayAnswers(answers){
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
    const popAudio = new Audio("/static/audios/pop.mp3");

    // display players' final answers
    for (let icons = 0; icons < players.length; icons++){
        setTimeout(() => {
            const guessedIcon = document.createElement("img");
            guessedIcon.src = players[icons].playerImg;
            guessedIcon.classList.add("pfp");
            // !! account for players who used second selection ability
            const chosenAnswer = answers.find(selectedAnswer => selectedAnswer.textContent == players[icons].finalAnswer);
            const chosenByDiv = chosenAnswer.parentElement.querySelector(`.chosenBy`);
            console.log(chosenByDiv);
            popAudio.play();
            chosenByDiv.appendChild(guessedIcon);
        }, icons*1000);            
    }

    // display who wrote each guess
    const lastPlayer = players.reduce((loser, current) => current.pts < loser.pts ? current : loser);
    for (let authors = 0; authors < players.length; authors++){
        setTimeout(() => {
            const author = document.createElement("p");
            author.textContent = players[authors].playerName;
            if (players[authors] == lastPlayer){
                author.id = "cursedLabel";
            }
            const initialGuess = answers.find(writtenAnswer => writtenAnswer.textContent == players[authors].initialGuess);
            const authorsDiv = initialGuess.parentElement.querySelector(`.authors`);
            authorsDiv.appendChild(author);
        }, stall*1000 + authors*1000);     
    }

    // highlight correct answer
    setTimeout(() => {
        const correctLabel = document.createElement("p");
        correctLabel.textContent = "ANSWER";
        correctLabel.id = "correctLabel";
        const correctAnswer = answers.find(correctAnswer => correctAnswer.textContent == answer);
        const authorsDiv = correctAnswer.parentElement.querySelector(`.authors`);
        authorsDiv.appendChild(correctLabel);
    }, stall*2000); 

    setTimeout(() => {
        //socket.emit("finishedRound");
    }, 4000 + stall*2000); 
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
    //quote.style.rotate = `${Math.random()*45}deg`
}

function addAbility(abilityName, abilitiesDiv){
    const ability = document.createElement("div");
    ability.classList.add("ability");

    const abilityIcon = document.createElement("img");
    abilityIcon.src = `/static/icons/${abilityName}.svg`;

    const abilityRounds = document.createElement("p");
    // !! display rounds abilities can be used
    abilityRounds.textContent = "0";

    ability.appendChild(abilityIcon);
    ability.appendChild(abilityRounds);
    abilitiesDiv.appendChild(ability);
}