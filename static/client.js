if (document.cookie == ""){
    document.cookie = "userID="+crypto.randomUUID();
}
let userIDCookie = document.cookie;

//const socket = io("https://trivia-k294.onrender.com/", {
const socket = io("http://localhost:3000", {
    auth: {
        token: userIDCookie
    }
});

const bodyElement = document.body;

socket.on("connect", () => {  
    bodyElement.textContent = "";
    firstTimePlayerSetup();
    console.log("connected");
});

socket.on("displayLobby", (players) => {
    displayLobby(players);
})

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
            socket.emit("playerJoined", nameEntry.value, userIDCookie.slice(7), pfpPreview.src);
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
    bodyElement.textContent = "";
    // !! display ALL players in lobby
    for (let i = 0; i < players.length; i++){
        const player = document.createElement("div");
        player.classList.add(i);

        const name = document.createElement("p");
        name.textContent = players[i].playerName;

        const img = document.createElement("img");
        img.src = players[i].playerImg;
        img.classList.add("pfp");

        player.appendChild(name);
        player.appendChild(img);
        bodyElement.appendChild(player);
    }
    //console.log(players);
}