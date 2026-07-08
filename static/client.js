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
    firstTimePlayerSetup();
    console.log("connected");
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
    imgEntryUI.classList.add("imgEntry");

    const nameEntry = document.createElement("input");
    nameEntry.type = "text";

    const joinBtn = document.createElement("button");
    joinBtn.classList.add("submit");
    joinBtn.textContent = "Submit";
    joinBtn.addEventListener("click", () => {
        socket.emit("playerJoined", nameEntry.value, userIDCookie.slice(7), imgEntry.value)
    })

    playerSetup.appendChild(imgEntryUI);
    playerSetup.appendChild(imgEntry);
    playerSetup.appendChild(nameEntry);
    playerSetup.appendChild(joinBtn);

    bodyElement.appendChild(playerSetup);
}