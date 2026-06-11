const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Room lookup API (for join-by-URL)
app.get('/api/room/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    const room = rooms.get(code);
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    res.json({ name: room.name });
});

// Store rooms in memory
const rooms = new Map();

// Generate a 6-character room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Fibonacci scale for voting
const FIBONACCI_SCALE = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, '?', '☕'];
const ALLOWED_POINT_VALUES = new Set(FIBONACCI_SCALE.map(String));
const ALLOWED_CELEBRATION_EMOJIS = ['🎉', '🏆', '🥳', '🌟', '👑', '🍓', '🍇', '🍌', '🍋', '🍉', '🦊', '🐸', '🦁', '🐧', '🦄'];
const ROOM_CODE_PATTERN = /^[A-Z2-9]{6}$/;
const MAX_NAME_LENGTH = 60;
const MAX_ROOM_NAME_LENGTH = 100;
const MAX_STORY_TITLE_LENGTH = 120;
const MAX_STORY_DESCRIPTION_LENGTH = 1000;

function cleanText(value, maxLength) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
}

function normalizeRoomCode(value) {
    if (typeof value !== 'string') return null;
    const code = value.trim().toUpperCase();
    return ROOM_CODE_PATTERN.test(code) ? code : null;
}

function normalizePointValue(value) {
    const normalized = String(value);
    return ALLOWED_POINT_VALUES.has(normalized) ? normalized : null;
}

function getCurrentStory(room) {
    const index = room.currentStoryIndex;
    if (!Number.isInteger(index) || index < 0 || index >= room.stories.length) return null;
    return room.stories[index];
}

function getVoteStatus(room) {
    const players = Array.from(room.members.values()).filter(m => m.role === 'player');
    return {
        voteCount: room.votes.size,
        playerCount: players.length,
        votedMembers: Array.from(room.votes.keys())
    };
}

function emitVoteUpdate(room) {
    io.to(room.code).emit('voteUpdate', getVoteStatus(room));
}

function promoteNextHost(room) {
    const sortedMembers = Array.from(room.members.values())
        .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));

    if (sortedMembers.length === 0) return null;

    const newHost = sortedMembers[0];
    newHost.isHost = true;
    newHost.role = 'player';
    room.hostId = newHost.id;

    io.to(room.code).emit('hostChanged', {
        newHost,
        members: Array.from(room.members.values())
    });
    emitVoteUpdate(room);
    return newHost;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create a new room
    socket.on('createRoom', (payload = {}) => {
        const roomName = cleanText(payload.roomName, MAX_ROOM_NAME_LENGTH);
        const userName = cleanText(payload.userName, MAX_NAME_LENGTH);
        if (!roomName || !userName) {
            socket.emit('error', { message: 'Room name and your name are required.' });
            return;
        }

        const roomCode = generateRoomCode();
        const room = {
            code: roomCode,
            name: roomName,
            hostId: socket.id,
            members: new Map(),
            stories: [],
            currentStoryIndex: -1,
            votes: new Map(),
            votingActive: false,
            votesRevealed: false,
            celebrationEmoji: '🎉',
            createdAt: new Date()
        };

        // Add creator as host
        room.members.set(socket.id, {
            id: socket.id,
            name: userName,
            role: 'player', // Host can also be player/spectator
            isHost: true,
            joinedAt: new Date()
        });

        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomCode = roomCode;

        socket.emit('roomCreated', {
            roomCode,
            roomName,
            isHost: true,
            members: Array.from(room.members.values()),
            stories: room.stories,
            ...getVoteStatus(room)
        });

        console.log(`Room created: ${roomCode} by ${userName}`);
    });

    // Join an existing room
    socket.on('joinRoom', (payload = {}) => {
        const roomCode = normalizeRoomCode(payload.roomCode);
        const userName = cleanText(payload.userName, MAX_NAME_LENGTH);
        if (!roomCode || !userName) {
            socket.emit('error', { message: 'Room code and your name are required.' });
            return;
        }

        const room = rooms.get(roomCode);

        if (!room) {
            socket.emit('error', { message: 'Room not found. Please check the code and try again.' });
            return;
        }

        // Check if name already exists
        const existingMember = Array.from(room.members.values()).find(m => m.name === userName);
        if (existingMember) {
            socket.emit('error', { message: 'Someone with that name is already in the room.' });
            return;
        }

        room.members.set(socket.id, {
            id: socket.id,
            name: userName,
            role: 'player',
            isHost: false,
            joinedAt: new Date()
        });

        socket.join(roomCode);
        socket.roomCode = roomCode;

        // Get current story if any
        const currentStory = getCurrentStory(room);

        socket.emit('roomJoined', {
            roomCode: room.code,
            roomName: room.name,
            isHost: false,
            members: Array.from(room.members.values()),
            stories: room.stories,
            currentStoryIndex: room.currentStoryIndex,
            currentStory,
            votingActive: room.votingActive,
            votesRevealed: room.votesRevealed,
            votes: room.votesRevealed ? Object.fromEntries(room.votes) : {},
            celebrationEmoji: room.celebrationEmoji,
            ...getVoteStatus(room)
        });

        // Notify others
        io.to(room.code).emit('memberJoined', {
            member: room.members.get(socket.id),
            members: Array.from(room.members.values())
        });
        emitVoteUpdate(room);

        console.log(`${userName} joined room ${roomCode}`);
    });

    // Toggle role (player/spectator)
    socket.on('toggleRole', () => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member) return;

        member.role = member.role === 'player' ? 'spectator' : 'player';

        // If they were a player and had voted, remove their vote
        if (member.role === 'spectator' && room.votes.has(socket.id)) {
            room.votes.delete(socket.id);
        }

        io.to(room.code).emit('memberUpdated', {
            member,
            members: Array.from(room.members.values()),
            votes: room.votesRevealed ? Object.fromEntries(room.votes) : {}
        });
        emitVoteUpdate(room);
    });

    // Designate a new host (Host only)
    socket.on('designateHost', (payload = {}) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

        const newHostId = typeof payload.memberId === 'string' ? payload.memberId : '';
        const newHost = room.members.get(newHostId);
        if (!newHost || newHost.id === socket.id) return;

        for (const roomMember of room.members.values()) {
            roomMember.isHost = false;
        }

        newHost.isHost = true;
        newHost.role = 'player';
        room.hostId = newHost.id;

        io.to(room.code).emit('hostChanged', {
            newHost,
            members: Array.from(room.members.values())
        });
        emitVoteUpdate(room);
    });

    // Add a new story (Host only)
    socket.on('addStory', (payload = {}) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

        const title = cleanText(payload.title, MAX_STORY_TITLE_LENGTH) || `Story #${room.stories.length + 1}`;
        const description = cleanText(payload.description, MAX_STORY_DESCRIPTION_LENGTH);

        const story = {
            id: uuidv4(),
            title,
            description,
            finalPoints: null,
            votes: {},
            votedAt: null,
            createdAt: new Date()
        };

        room.stories.push(story);

        io.to(room.code).emit('storyAdded', {
            story,
            stories: room.stories
        });
    });

    // Set celebration emoji (Host only)
    socket.on('setCelebrationEmoji', (payload = {}) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;
        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

        const emoji = payload.emoji;
        if (!ALLOWED_CELEBRATION_EMOJIS.includes(emoji)) return;
        room.celebrationEmoji = emoji;
        io.to(room.code).emit('celebrationEmojiChanged', { emoji });
    });

    // Select a story to vote on (Host only)
    socket.on('selectStory', (payload = {}) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

        const storyIndex = Number(payload.storyIndex);
        if (!Number.isInteger(storyIndex) || storyIndex < 0 || storyIndex >= room.stories.length) return;
        if (room.stories[storyIndex].finalPoints !== null) return;

        room.currentStoryIndex = storyIndex;
        room.votes.clear();
        room.votingActive = true;
        room.votesRevealed = false;

        io.to(room.code).emit('storySelected', {
            currentStoryIndex: storyIndex,
            currentStory: room.stories[storyIndex],
            votingActive: true,
            votesRevealed: false,
            ...getVoteStatus(room)
        });
    });

    // Cast a vote
    socket.on('vote', (payload = {}) => {
        const room = rooms.get(socket.roomCode);
        if (!room || !room.votingActive || room.votesRevealed || !getCurrentStory(room)) return;

        const member = room.members.get(socket.id);
        if (!member || member.role !== 'player') return;

        const value = normalizePointValue(payload.value);
        if (value === null) return;

        room.votes.set(socket.id, {
            voterId: socket.id,
            voterName: member.name,
            value
        });

        // Send vote count update (not revealing actual votes)
        emitVoteUpdate(room);
    });

    // Reveal votes (Host only)
    socket.on('revealVotes', () => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;
        if (!getCurrentStory(room)) return;

        // Start countdown
        io.to(room.code).emit('countdownStarted');

        // After countdown, reveal votes
        setTimeout(() => {
            room.votesRevealed = true;
            room.votingActive = false;

            const votes = Object.fromEntries(room.votes);
            const voteValues = Array.from(room.votes.values())
                .map(v => v.value);

            // Check if all votes are the same (works for both numbers and strings)
            const allSame = voteValues.length > 0 && voteValues.every(v => String(v) === String(voteValues[0]));
            const consensus = allSame ? voteValues[0] : null;

            io.to(room.code).emit('votesRevealed', {
                votes,
                consensus,
                allSame
            });
        }, 3000); // 3 second countdown (3 numbers at 800ms + buffer)
    });

    // Assign final points (Host only, when no consensus)
    socket.on('assignPoints', (payload = {}) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

        const points = normalizePointValue(payload.points);
        const story = getCurrentStory(room);
        if (points !== null && story) {
            story.finalPoints = points;
            story.votes = Object.fromEntries(room.votes);
            story.votedAt = new Date();

            io.to(room.code).emit('pointsAssigned', {
                storyIndex: room.currentStoryIndex,
                story,
                stories: room.stories
            });
        }
    });

    // Accept consensus points
    socket.on('acceptConsensus', (payload = {}) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

        const points = normalizePointValue(payload.points);
        const story = getCurrentStory(room);
        if (points !== null && story) {
            story.finalPoints = points;
            story.votes = Object.fromEntries(room.votes);
            story.votedAt = new Date();

            io.to(room.code).emit('pointsAssigned', {
                storyIndex: room.currentStoryIndex,
                story,
                stories: room.stories
            });
        }
    });

    // View historical card
    socket.on('viewHistoricalCard', (payload = {}) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

        const storyIndex = Number(payload.storyIndex);
        if (Number.isInteger(storyIndex) && storyIndex >= 0 && storyIndex < room.stories.length) {
            io.to(room.code).emit('viewingHistoricalCard', {
                storyIndex,
                story: room.stories[storyIndex]
            });
        }
    });

    // Revote a completed story (Host only)
    socket.on('revoteStory', (payload = {}) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

        const storyIndex = Number(payload.storyIndex);
        if (!Number.isInteger(storyIndex) || storyIndex < 0 || storyIndex >= room.stories.length) return;

        const story = room.stories[storyIndex];
        story.finalPoints = null;
        story.votes = {};
        story.votedAt = null;

        room.currentStoryIndex = storyIndex;
        room.votes.clear();
        room.votingActive = true;
        room.votesRevealed = false;

        io.to(room.code).emit('revoteStarted', {
            storyIndex,
            story,
            stories: room.stories,
            ...getVoteStatus(room)
        });

        console.log(`Revote started for story ${storyIndex} in room ${room.code}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const roomCode = socket.roomCode;
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        const leavingMember = room.members.get(socket.id);
        room.members.delete(socket.id);
        room.votes.delete(socket.id);

        if (room.members.size === 0) {
            rooms.delete(roomCode);
            console.log(`Room ${roomCode} closed - all members left`);
            return;
        }

        if (leavingMember && leavingMember.isHost) {
            promoteNextHost(room);
        }

        // Notify remaining members
        io.to(room.code).emit('memberLeft', {
            member: leavingMember,
            members: Array.from(room.members.values())
        });

        // Update vote count
        emitVoteUpdate(room);

        console.log(`${leavingMember?.name || 'Unknown'} left room ${roomCode}`);
    });

    // Leave room manually - performs same cleanup as disconnect
    socket.on('leaveRoom', () => {
        const roomCode = socket.roomCode;
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) {
            socket.leave(roomCode);
            socket.roomCode = null;
            return;
        }

        const leavingMember = room.members.get(socket.id);
        room.members.delete(socket.id);
        room.votes.delete(socket.id);

        // Leave the socket.io room
        socket.leave(roomCode);
        socket.roomCode = null;

        // If room is empty, delete it
        if (room.members.size === 0) {
            rooms.delete(roomCode);
            console.log(`Room ${roomCode} closed - all members left`);
            return;
        }

        // If host left, assign new host (first-in strategy)
        if (leavingMember && leavingMember.isHost) {
            promoteNextHost(room);
        }

        // Notify remaining members
        io.to(room.code).emit('memberLeft', {
            member: leavingMember,
            members: Array.from(room.members.values())
        });

        // Update vote count
        emitVoteUpdate(room);

        console.log(`${leavingMember?.name || 'Unknown'} manually left room ${roomCode}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`⚔️ Point Battle server running on http://localhost:${PORT}`);
});
