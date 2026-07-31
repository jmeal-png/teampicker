const socket = io();

const joinCard = document.getElementById("join-card");
const lobbyCard = document.getElementById("lobby-card");
const teamScreen = document.getElementById("team-screen");
const joinForm = document.getElementById("join-form");
const nameInput = document.getElementById("name");
const joinMessage = document.getElementById("join-message");
const partyCodeText = document.getElementById("party-code-text");
const teamName = document.getElementById("team-name");
const teamColorCircle = document.getElementById("team-color-circle");

const code = window.location.pathname.split("/").pop().toUpperCase();

let savedParticipant = JSON.parse(
  sessionStorage.getItem(`participant-${code}`) || "null"
);

partyCodeText.textContent = `Party code: ${code}`;

function showMessage(message, isError = false) {
  joinMessage.textContent = message;
  joinMessage.classList.toggle("error", isError);
}

function showLobby() {
  joinCard.hidden = true;
  lobbyCard.hidden = false;
  teamScreen.hidden = true;
}

function showTeam(assignment) {
  joinCard.hidden = true;
  lobbyCard.hidden = true;
  teamScreen.hidden = false;

  teamName.textContent = assignment.teamName;
  teamColorCircle.style.backgroundColor = assignment.teamColor;
  teamScreen.style.backgroundColor = assignment.teamColor;
}

function joinParty(name, participantId = null) {
  socket.emit(
    "joinParty",
    {
      code,
      name,
      participantId
    },
    (response) => {
      if (!response.ok) {
        showMessage(response.error, true);
        return;
      }

      savedParticipant = {
        id: response.participantId,
        name
      };

      sessionStorage.setItem(
        `participant-${code}`,
        JSON.stringify(savedParticipant)
      );

      if (response.assignment) {
        showTeam(response.assignment);
      } else {
        showLobby();
      }
    }
  );
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();

  if (!name) {
    showMessage("Please enter your name.", true);
    return;
  }

  showMessage("");
  joinParty(name);
});

socket.on("teamAssigned", (assignment) => {
  showTeam(assignment);
});

socket.on("connect", () => {
  if (savedParticipant) {
    joinParty(savedParticipant.name, savedParticipant.id);
  }
});