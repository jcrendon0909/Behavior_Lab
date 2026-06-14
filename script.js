// SCROLL ANIMATION
const reveals = document.querySelectorAll(".reveal");

window.addEventListener("scroll", () => {
  reveals.forEach((el) => {
    const windowHeight = window.innerHeight;
    const elementTop = el.getBoundingClientRect().top;

    if (elementTop < windowHeight - 100) {
      el.classList.add("active");
    }
  });
});

// CHAT
const input = document.getElementById("input");
const messages = document.getElementById("messages");

input.addEventListener("keypress", async (e) => {
  if (e.key === "Enter") {
    const text = input.value;

    messages.innerHTML += `<div class="user">${text}</div>`;

    const res = await fetch("http://localhost:3000/chat", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({message:text})
    });

    const data = await res.json();

    messages.innerHTML += `<div class="assistant">${data.reply}</div>`;

    input.value = "";
  }
});