const path = require("path");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

/*
  Important:
  When testing on phones, set BASE_URL to your computer's LAN IP, for example:

  BASE_URL=http://192.168.1.25:3000 npm start
*/
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "host.html"));
});

app.get("/host", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "host.html"));
});

app.get("/join/:code", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "join.html"));
});

const parties = new Map();

const TEAM_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#ec4899"
];

function createCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function createUniqueCode() {
  let code = createCode();

  while (parties.has(code)) {
    code = createCode();
  }

  return code;
}

function getParticipantList(party) {
  return [...party.participants.values()].map((participant) => ({
    id: participant.id,
    name: participant.name
  }));
}

function getTeamsForHost(party) {
  return party.teams.map((team) => ({
    name: team.name,
    color: team.color,
    members: team.members.map((memberId) => {
      const participant = party.participants.get(memberId);

      return {
        id: participant.id,
        name: participant.name
      };
    })
  }));
}

function emitParticipantsToHost(party) {
  io.to(`host:${party.code}`).emit("participantList", {
    participants: getParticipantList(party)
  });
}

function sendAssignmentToParticipant(socket, participant) {
  if (!participant.assignment) return;

  socket.emit("teamAssigned", participant.assignment);
}

function assignTeams(party, teamCount) {
  const participants = [...party.participants.values()];

  // Shuffle participants for random team assignment.
  for (let i = participants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [participants[i], participants[j]] = [participants[j], participants[i]];
  }

  party.teams = Array.from({ length: teamCount }, (_, index) => ({
    name: `Team ${index + 1}`,
    color: TEAM_COLORS[index % TEAM_COLORS.length],
    members: []
  }));

  participants.forEach((participant, index) => {
    const team = party.teams[index % teamCount];

    team.members.push(participant.id);

    participant.assignment = {
      teamName: team.name,
      teamColor: team.color
    };
  });

  party.status = "started";
}

io.on("connection", (socket) => {
  socket.on("createParty", (callback) => {
    const code = createUniqueCode();
    const partyId = crypto.randomUUID();
    const hostToken = crypto.randomUUID();

    const party = {
      partyId,
      code,
      hostToken,
      status: "lobby",
      participants: new Map(),
      teams: []
    };

    parties.set(code, party);

    socket.join(`host:${code}`);

    callback({
      ok: true,
      partyId,
      code,
      hostToken,
      joinUrl: `${BASE_URL}/join/${code}`
    });
  });

  socket.on("subscribeHost", ({ code, hostToken }, callback) => {
    const party = parties.get(String(code || "").toUpperCase());

    if (!party || party.hostToken !== hostToken) {
      return callback({ ok: false, error: "Party not found or host access denied." });
    }

    socket.join(`host:${party.code}`);

    callback({
      ok: true,
      code: party.code,
      status: party.status,
      participants: getParticipantList(party),
      teams: party.status === "started" ? getTeamsForHost(party) : []
    });
  });

  socket.on("joinParty", ({ code, name, participantId }, callback) => {
    const cleanCode = String(code || "").trim().toUpperCase();
    const cleanName = String(name || "").trim().slice(0, 40);
    const party = parties.get(cleanCode);

    if (!party) {
      return callback({ ok: false, error: "Party not found." });
    }

    if (!cleanName) {
      return callback({ ok: false, error: "Please enter your name." });
    }

    let participant = participantId
      ? party.participants.get(participantId)
      : null;

    // Existing participant reconnecting.
    if (participant) {
      participant.socketId = socket.id;
      socket.join(`participant:${participant.id}`);

      callback({
        ok: true,
        participantId: participant.id,
        status: party.status,
        assignment: participant.assignment || null
      });

      sendAssignmentToParticipant(socket, participant);
      return;
    }

    if (party.status !== "lobby") {
      return callback({
        ok: false,
        error: "This party has already started."
      });
    }

    participant = {
      id: crypto.randomUUID(),
      name: cleanName,
      socketId: socket.id,
      assignment: null
    };

    party.participants.set(participant.id, participant);
    socket.join(`participant:${participant.id}`);

    emitParticipantsToHost(party);

    callback({
      ok: true,
      participantId: participant.id,
      status: party.status,
      assignment: null
    });
  });

  socket.on("startTeams", ({ code, hostToken, teamCount }, callback) => {
    const party = parties.get(String(code || "").toUpperCase());

    if (!party || party.hostToken !== hostToken) {
      return callback({ ok: false, error: "Host access denied." });
    }

    if (party.status !== "lobby") {
      return callback({ ok: false, error: "Teams have already been started." });
    }

    const count = Number(teamCount);
    const participantCount = party.participants.size;

    if (!Number.isInteger(count) || count < 1) {
      return callback({
        ok: false,
        error: "Enter a valid number of teams."
      });
    }

    if (participantCount === 0) {
      return callback({
        ok: false,
        error: "At least one participant must join first."
      });
    }

    if (count > participantCount) {
      return callback({
        ok: false,
        error: "You cannot create more teams than participants."
      });
    }

    assignTeams(party, count);

    // Send each participant only their own team assignment.
    for (const participant of party.participants.values()) {
      io.to(`participant:${participant.id}`).emit(
        "teamAssigned",
        participant.assignment
      );
    }

    const teams = getTeamsForHost(party);

    io.to(`host:${party.code}`).emit("teamsCreated", { teams });

    callback({
      ok: true,
      teams
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running at ${BASE_URL}`);
});