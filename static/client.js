//const socket = io("https://trivia-k294.onrender.com/");
const socket = io("http://localhost:3000");

socket.on("connect", () => {  
    console.log("connected");
});

socket.on("sendQuestion", (question) => {
    const questionText = document.querySelector(`p.question`);
    questionText.textContent = question;
});

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