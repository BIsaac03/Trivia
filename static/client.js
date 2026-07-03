const socket = io.connect("https://trivia-k294.onrender.com/");

socket.on("connect", () => {  
    console.log("connected");
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