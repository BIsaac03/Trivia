if (document.cookie == ""){
    document.cookie = "userID=p"+crypto.randomUUID();
}
const userIDCookie = document.cookie;
const myID = userIDCookie.slice(7);

const socket = io("https://trivia-k294.onrender.com/", {
//const socket = io("http://localhost:3000", {
    auth: {
        token: userIDCookie
    }
});

const bodyElement = document.body;

socket.on("connect", () => {  
    document.body.innerHTML = "";
    socket.emit("playerConnected", myID);
    //console.log("connected");
});

socket.on("newConnection", () => {
    firstTimePlayerSetup();
});

socket.on("reconnection", (gameState, players) => {
    // joining a lobby
    if (!gameState.gameHasStarted){
        const alreadyJoined = players.find(player => player.playerID == myID);
        if (alreadyJoined == undefined){
            firstTimePlayerSetup();
        }
        else{
            displayLobby(players);
        }
    }
    // joining an ongoing game
    else{
        // !! apply current game state if user is an active player
        // !! otherwise, restrict all functionality
    }
});

socket.on("displayLobby", (players) => {
    displayLobby(players);
});

socket.on("playerJoined", (newPlayer) => {
    const lobby = document.getElementById("lobby");
    if (lobby != undefined){
        displayPlayerInLobby(newPlayer, lobby);
    } 
});

socket.on("playerModified", (modifiedPlayer) => {
    const name = document.querySelector(`.${modifiedPlayer.playerID} .name`)
    name.textContent = modifiedPlayer.playerName;

    const img = document.querySelector(`.${modifiedPlayer.playerID} .pfp`)
    img.src = modifiedPlayer.playerImg;
});

socket.on("sendQuestion", (question) => {
    const questionText = document.querySelector(`p.question`);
    questionText.textContent = question;
});

/*
let hasSubmitted = false;
const submitBtn = document.querySelector(`.guess .submit`);
submitBtn.addEventListener("click", () => {
    if (!hasSubmitted){
        const userGuess = document.querySelector(`.guess .guess`);
        hasSubmitted = true;
        console.log(userGuess.value);
        userGuess.placeholder = "Submitted!";
        userGuess.disabled = true;
        userGuess.value = "";

        const answers = document.getElementsByClassName("answers")[0];
        answers.style.display = "grid";
    }
})
*/

function firstTimePlayerSetup(){

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

    const pfpPreview = document.createElement("img");
    imgEntry.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.addEventListener("load", () => {
                pfpPreview.src = reader.result;
                pfpPreview.classList.add("imgEntry", "pfp");
                imgEntryUI.appendChild(pfpPreview);
            });
            reader.readAsDataURL(file);
        }
    });

    const nameEntry = document.createElement("input");
    nameEntry.type = "text";

    const joinBtn = document.createElement("button");
    joinBtn.classList.add("submit");
    joinBtn.textContent = "Submit";
    joinBtn.addEventListener("click", () => {
        if (nameEntry.value != "" && imgEntry.value != "") {
            console.log(myID);
            socket.emit("test", pfpPreview.src);
            socket.emit("playerJoined", nameEntry.value, myID, pfpPreview.src);
            socket.emit("waitingInLobby");
        }
    })

    playerSetup.appendChild(imgEntryUI);
    playerSetup.appendChild(imgEntry);
    playerSetup.appendChild(nameEntry);
    playerSetup.appendChild(joinBtn);

    bodyElement.appendChild(playerSetup);
}

function displayLobby(players){
    console.log("lobby display");
    console.log(players);
    document.body.innerHTML = "";
    
    const lobby = document.createElement("div");
    lobby.id = "lobby";
    bodyElement.appendChild(lobby);

    for (let i = 0; i < players.length; i++){
        displayPlayerInLobby(players[i], lobby)
    }
}

function displayPlayerInLobby(displayedPlayer, lobby){
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
    lobby.appendChild(player);
}