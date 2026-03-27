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

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create a new room
    socket.on('createRoom', ({ roomName, userName }) => {
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
            stories: room.stories
        });

        console.log(`Room created: ${roomCode} by ${userName}`);
    });

    // Join an existing room
    socket.on('joinRoom', ({ roomCode, userName }) => {
        const room = rooms.get(roomCode.toUpperCase());

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

        socket.join(roomCode.toUpperCase());
        socket.roomCode = roomCode.toUpperCase();

        // Get current story if any
        const currentStory = room.currentStoryIndex >= 0 ? room.stories[room.currentStoryIndex] : null;

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
            celebrationEmoji: room.celebrationEmoji
        });

        // Notify others
        io.to(room.code).emit('memberJoined', {
            member: room.members.get(socket.id),
            members: Array.from(room.members.values())
        });

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
    });

    // Add a new story (Host only)
    socket.on('addStory', ({ title, description }) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

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
    socket.on('setCelebrationEmoji', ({ emoji }) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;
        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;
        // Only allow a small safe set of known emoji values
        const allowed = ['🎉','🎊','🏆','🥳','🌟','⭐','✨','💫','🚀','🎯','🔥','💎','👑','🎆','🎇'];
        if (!allowed.includes(emoji)) return;
        room.celebrationEmoji = emoji;
        io.to(room.code).emit('celebrationEmojiChanged', { emoji });
    });

    // Select a story to vote on (Host only)
    socket.on('selectStory', ({ storyIndex }) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

        room.currentStoryIndex = storyIndex;
        room.votes.clear();
        room.votingActive = true;
        room.votesRevealed = false;

        io.to(room.code).emit('storySelected', {
            currentStoryIndex: storyIndex,
            currentStory: room.stories[storyIndex],
            votingActive: true,
            votesRevealed: false
        });
    });

    // Cast a vote
    socket.on('vote', ({ value }) => {
        const room = rooms.get(socket.roomCode);
        if (!room || !room.votingActive || room.votesRevealed) return;

        const member = room.members.get(socket.id);
        if (!member || member.role !== 'player') return;

        room.votes.set(socket.id, {
            oderId: socket.id,
            odeName: member.name,
            value
        });

        // Send vote count update (not revealing actual votes)
        const players = Array.from(room.members.values()).filter(m => m.role === 'player');
        io.to(room.code).emit('voteUpdate', {
            voteCount: room.votes.size,
            playerCount: players.length,
            votedMembers: Array.from(room.votes.keys())
        });
    });

    // Reveal votes (Host only)
    socket.on('revealVotes', () => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

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
    socket.on('assignPoints', ({ points }) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

        if (room.currentStoryIndex >= 0) {
            const story = room.stories[room.currentStoryIndex];
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
    socket.on('acceptConsensus', ({ points }) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

        if (room.currentStoryIndex >= 0) {
            const story = room.stories[room.currentStoryIndex];
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
    socket.on('viewHistoricalCard', ({ storyIndex }) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const member = room.members.get(socket.id);
        if (!member || !member.isHost) return;

        if (storyIndex >= 0 && storyIndex < room.stories.length) {
            io.to(room.code).emit('viewingHistoricalCard', {
                storyIndex,
                story: room.stories[storyIndex]
            });
        }
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

        // If room is empty, delete it
        if (room.members.size === 0) {
            rooms.delete(roomCode);
            console.log(`Room ${roomCode} closed - all members left`);
            return;
        }

        // If host left, assign new host (first-in strategy)
        if (leavingMember && leavingMember.isHost) {
            const sortedMembers = Array.from(room.members.values())
                .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
            
            if (sortedMembers.length > 0) {
                const newHost = sortedMembers[0];
                newHost.isHost = true;
                room.hostId = newHost.id;

                io.to(room.code).emit('hostChanged', {
                    newHost,
                    members: Array.from(room.members.values())
                });
            }
        }

        // Notify remaining members
        io.to(room.code).emit('memberLeft', {
            member: leavingMember,
            members: Array.from(room.members.values())
        });

        // Update vote count
        const players = Array.from(room.members.values()).filter(m => m.role === 'player');
        io.to(room.code).emit('voteUpdate', {
            voteCount: room.votes.size,
            playerCount: players.length,
            votedMembers: Array.from(room.votes.keys())
        });

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
            const sortedMembers = Array.from(room.members.values())
                .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
            
            if (sortedMembers.length > 0) {
                const newHost = sortedMembers[0];
                newHost.isHost = true;
                room.hostId = newHost.id;

                io.to(room.code).emit('hostChanged', {
                    newHost,
                    members: Array.from(room.members.values())
                });
            }
        }

        // Notify remaining members
        io.to(room.code).emit('memberLeft', {
            member: leavingMember,
            members: Array.from(room.members.values())
        });

        // Update vote count
        const players = Array.from(room.members.values()).filter(m => m.role === 'player');
        io.to(room.code).emit('voteUpdate', {
            voteCount: room.votes.size,
            playerCount: players.length,
            votedMembers: Array.from(room.votes.keys())
        });

        console.log(`${leavingMember?.name || 'Unknown'} manually left room ${roomCode}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`⚔️ Point Battle server running on http://localhost:${PORT}`);
});
