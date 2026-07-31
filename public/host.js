const socket = io();

const createButton = document.getElementById("create-party-btn");
const emptyState = document.getElementById("empty-state");
const partyContent = document.getElementById("party-content");
const joinCode = document.getElementById("join-code");
const joinLink = document.getElementById("join-link");
const qrCodeElement = document.getElementById("qrcode");
const participantCount = document.getElementById("participant-count");
const participantList = document.getElementById("participant-list");
const teamCountInput = document.getElementById("team-count");
const startButton = document.getElementById("start-btn");
const hostMessage = document.getElementById("host-message");
const teamsSection = document.getElementById("teams-section");
const teamsList = document.getElementById("teams-list");

let party = JSON.parse(sessionStorage.getItem("hostParty") || "null");

function showMessage(message, isError = false) {
  hostMessage.textContent = message;
  hostMessage.classList.toggle("error", isError);
}

function renderParticipants(participants) {
  participantCount.textContent = participants.length;

  participantList.innerHTML = "";

  if (participants.length === 0) {
    participantList.innerHTML = "<li>No one has joined yet.</li>";
    return;
  }

  participants.forEach((participant) => {
    const item = document.createElement("li");
    item.textContent = participant.name;
    participantList.appendChild(item);
  });
}

function renderTeams(teams) {
  teamsSection.hidden = false;
  teamsList.innerHTML = "";

  teams.forEach((team) => {
    const card = document.createElement("article");
    card.className = "team-card";
    card.style.borderTopColor = team.color;

    const title = document.createElement("h3");
    title.textContent = team.name;

    const color = document.createElement("span");
    color.className = "color-dot";
    color.style.backgroundColor = team.color;

    title.prepend(color);

    const members = document.createElement("ul");

    team.members.forEach((member) => {
      const item = document.createElement("li");
      item.textContent = member.name;
      members.appendChild(item);
    });

    card.append(title, members);
    teamsList.appendChild(card);
  });
}

function showPartyDetails() {
  emptyState.hidden = true;
  partyContent.hidden = false;

  joinCode.textContent = party.code;
  joinLink.textContent = party.joinUrl;
  joinLink.href = party.joinUrl;

  qrCodeElement.innerHTML = "";

  new QRCode(qrCodeElement, {
    text: party.joinUrl,
    width: 220,
    height: 220,
    colorDark: "#111827",
    colorLight: "#ffffff"
  });
}

function subscribeToExistingParty() {
  if (!party) return;

  socket.emit(
    "subscribeHost",
    {
      code: party.code,
      hostToken: party.hostToken
    },
    (response) => {
      if (!response.ok) {
        sessionStorage.removeItem("hostParty");
        party = null;
        return;
      }

      showPartyDetails();
      renderParticipants(response.participants);

      if (response.status === "started") {
        startButton.disabled = true;
        teamCountInput.disabled = true;
        renderTeams(response.teams);
        showMessage("Teams have already been assigned.");
      }
    }
  );
}

createButton.addEventListener("click", () => {
  socket.emit("createParty", (response) => {
    if (!response.ok) {
      showMessage("Could not create a party.", true);
      return;
    }

    party = response;
    sessionStorage.setItem("hostParty", JSON.stringify(party));

    teamsSection.hidden = true;
    startButton.disabled = false;
    teamCountInput.disabled = false;
    renderParticipants([]);
    showPartyDetails();
    showMessage("");
  });
});

startButton.addEventListener("click", () => {
  if (!party) return;

  socket.emit(
    "startTeams",
    {
      code: party.code,
      hostToken: party.hostToken,
      teamCount: Number(teamCountInput.value)
    },
    (response) => {
      if (!response.ok) {
        showMessage(response.error, true);
        return;
      }

      startButton.disabled = true;
      teamCountInput.disabled = true;
      showMessage("Teams assigned successfully.");
      renderTeams(response.teams);
    }
  );
});

socket.on("participantList", ({ participants }) => {
  renderParticipants(participants);
});

socket.on("teamsCreated", ({ teams }) => {
  startButton.disabled = true;
  teamCountInput.disabled = true;
  renderTeams(teams);
});

socket.on("connect", subscribeToExistingParty);

if (party) {
  showPartyDetails();
}