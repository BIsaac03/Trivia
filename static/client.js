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
    // restore HOST state
    if (hostID == myID){
        if (!gameState.gameHasStarted){
            displayLobby(players);
        }
        else{
            setUpTriviaDisplay(players);
            displayQuestion(gameState.question);
            // !! display answers if submitted
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
                waitingInLobby(alreadyJoined);
                // !! allow player to update profile
            }
        }

        // joining an ongoing game
        else{
            // !! apply current game state if user is an active player
            const me = players.find(player => player.playerID == myID);
            if (me != undefined){
                // !! allow user to answer question if not yet submitted
                // !! display answers if all have submitted
            }

            // !! otherwise, restrict all functionality
            else{

            }
        }
    }   
});


// PLAYER events
socket.on("newConnection", () => {
    firstTimePlayerSetup();
});

socket.on("waitingInLobby", (me, isFirstTimeJoin) => {
    waitingInLobby(me);
})

// HOST events
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

socket.on("startTrivia", (players) => {
    setUpTriviaDisplay(players);
});

socket.on("nextQuestion", (question) => {
    displayQuestion(question);
});

socket.on("sendAnswerChoices", (answers) => {
    displayAnswers(answers)
});

////// PLAYER functions
async function displayPfp(file) {
    const compressedFile = await imageCompression(file, {maxSizeMB: 0.5});
    const pfpPreview = document.querySelector(`.preview.imgEntry.pfp`);
    
    const reader = new FileReader();
    reader.addEventListener("load", () => {
        pfpPreview.src = reader.result;  
    });
    reader.readAsDataURL(compressedFile);
}

function firstTimePlayerSetup(){
    document.body.innerHTML = "";
    const playerSetup = document.createElement("div");
    playerSetup.classList.add("me")

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
    pfpPreview.classList.add("preview", "imgEntry", "pfp");

    imgEntryUI.appendChild(imgEntryPromptIcon);
    imgEntryUI.appendChild(pfpPreview);

    imgEntry.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            imgEntryPromptIcon.remove();
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
        const pfpPreview = document.querySelector(`.me img.preview`);
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

function waitingInLobby(me){
    const existingMessage = document.querySelector(`.inLobbyMessage`);
    if (existingMessage == undefined){
        const message = document.createElement("p");
        message.textContent = "You have successfully connected to the lobby. Remain here until trivia starts."
        message.classList.add("inLobbyMessage");
        bodyElement.appendChild(message);
    } 
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

function setUpTriviaDisplay(players){
    document.body.innerHTML = ""

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

    const guessDiv = document.createElement("div");
    guessDiv.classList.add("guess");
    const userGuess = document.createElement("input");
    userGuess.type = "text";
    userGuess.maxLength = 30;
    const submitBtn = document.createElement("button");
    submitBtn.id = ""
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
    guessDiv.appendChild(userGuess);
    guessDiv.appendChild(submitBtn);
    trivia.appendChild(guessDiv);
    trivia.appendChild(answersDiv);

    bodyElement.appendChild(playerStatuses);
    bodyElement.appendChild(trivia);
    toggleVisibleSelections()
}

function displayQuestion(question){
    const questionText = document.querySelector(`p.question`);
    questionText.textContent = question;
}

function displayAnswers(answers){
    const answersDiv = document.querySelector(`div.answers`);
    for (let i = 0; i < answers.length; i++){
        const answer = document.createElement("button");
        answer.textContent = answers[i];
        answer.addEventListener("click", () => {
            socket.emit("choseFinalAnswer", myID, answers[i]);
        })
        answersDiv.appendChild(answer);
    }
    const guessDiv = document.querySelector(`div.guess`);
    toggleVisibleSelections();
}

function toggleVisibleSelections(){
    const guessDiv = document.querySelector(`div.guess`);
    const answersDiv = document.querySelector(`div.answers`);
        console.log(guessDiv.style.display);

    if (guessDiv.style.display == "grid"){
        guessDiv.style.display = "none";
        answersDiv.style.display = "grid";
    }
    else{
        guessDiv.style.display = "grid";
        answersDiv.style.display = "none";
    }
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