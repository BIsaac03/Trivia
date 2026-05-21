console.log("hello world");



const submitBtn = document.querySelector(`.guess .submit`);
submitBtn.addEventListener("click", () => {
    const userGuess = document.querySelector(`.guess .guess`);
    console.log(userGuess.value);
    userGuess.placeholder = "Submitted!";
    userGuess.value = "";
})