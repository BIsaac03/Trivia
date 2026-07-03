const socket = io.connect("https://trivia-k294.onrender.com/");

socket.on("connect", () => {  
    console.log("connected");
});