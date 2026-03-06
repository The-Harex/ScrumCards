// Socket.io connection
const socket = io();

// App State
let appState = {
    roomCode: null,
    roomName: null,
    isHost: false,
    currentRole: 'player',
    members: [],
    stories: [],
    currentStoryIndex: -1,
    currentStory: null,
    votingActive: false,
    votesRevealed: false,
    votes: {},
    myVote: null,
    cardFlipped: false,
    voteCount: 0,
    playerCount: 0,
    votedMembers: []
};

// Fibonacci scale
const FIBONACCI_SCALE = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, '?', '☕'];

// DOM Elements
const homePage = document.getElementById('homePage');
const roomPage = document.getElementById('roomPage');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    generateStars();
    renderFibonacciCards();
});

// Generate background stars
function generateStars() {
    const starsContainer = document.getElementById('stars');
    for (let i = 0; i < 100; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.animationDelay = Math.random() * 3 + 's';
        star.style.opacity = Math.random() * 0.5 + 0.3;
        starsContainer.appendChild(star);
    }
}

// Render Fibonacci voting cards
function renderFibonacciCards() {
    const container = document.getElementById('fibonacciCards');
    container.innerHTML = FIBONACCI_SCALE.map(value => `
        <button onclick="castVote('${value}')" 
            class="vote-card w-12 h-16 md:w-14 md:h-20 bg-gradient-to-br from-mystic-600 to-mystic-800 rounded-lg border-2 border-mystic-400/50 flex items-center justify-center font-fantasy text-lg md:text-xl font-bold text-white hover:border-yellow-400 transition-all"
            data-value="${value}">
            ${value}
        </button>
    `).join('');
}

// Create Room
function createRoom() {
    const roomName = document.getElementById('createRoomName').value.trim();
    const userName = document.getElementById('createUserName').value.trim();

    if (!roomName || !userName) {
        showError('Please fill in all fields');
        return;
    }

    socket.emit('createRoom', { roomName, userName });
}

// Join Room
function joinRoom() {
    const roomCode = document.getElementById('joinRoomCode').value.trim().toUpperCase();
    const userName = document.getElementById('joinUserName').value.trim();

    if (!roomCode || !userName) {
        showError('Please fill in all fields');
        return;
    }

    socket.emit('joinRoom', { roomCode, userName });
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    setTimeout(() => errorDiv.classList.add('hidden'), 5000);
}

// Show toast notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    
    const colors = {
        info: 'bg-mystic-600/90 border-mystic-400',
        success: 'bg-enchanted-600/90 border-enchanted-400',
        warning: 'bg-flame-600/90 border-flame-400',
        error: 'bg-red-600/90 border-red-400'
    };

    toast.className = `${colors[type]} border backdrop-blur-lg px-4 py-3 rounded-xl text-white shadow-lg transform transition-all duration-300 translate-x-0`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Copy room code to clipboard
function copyRoomCode() {
    navigator.clipboard.writeText(appState.roomCode);
    showToast('Room code copied!', 'success');
}

// Toggle role (player/spectator)
function toggleRole() {
    socket.emit('toggleRole');
}

// Update role display
function updateRoleDisplay() {
    const toggle = document.getElementById('roleToggle');
    const icon = document.getElementById('roleIcon');
    const text = document.getElementById('roleText');

    if (appState.currentRole === 'player') {
        toggle.className = 'flex items-center gap-2 px-3 py-1 rounded-lg bg-enchanted-600/50 border border-enchanted-400/50 transition-all';
        icon.innerHTML = `<svg class="w-5 h-5 text-enchanted-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>`;
        text.textContent = 'Player';
        text.className = 'font-semibold text-enchanted-300';
    } else {
        toggle.className = 'flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-600/50 border border-gray-400/50 transition-all';
        icon.innerHTML = `<svg class="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
        </svg>`;
        text.textContent = 'Spectator';
        text.className = 'font-semibold text-gray-300';
    }

    // Update voting cards visibility
    const votingSection = document.getElementById('fibonacciCards');
    if (appState.currentRole === 'spectator') {
        votingSection.classList.add('opacity-50', 'pointer-events-none');
    } else {
        votingSection.classList.remove('opacity-50', 'pointer-events-none');
    }
}

// Add story (host only)
function addStory() {
    const title = document.getElementById('storyTitle').value.trim();
    const description = document.getElementById('storyDescription').value.trim();

    if (!title) {
        showToast('Please enter a story title', 'warning');
        return;
    }

    socket.emit('addStory', { title, description });
    document.getElementById('storyTitle').value = '';
    document.getElementById('storyDescription').value = '';
}

// Render story queue
function renderStoryQueue() {
    const container = document.getElementById('storyQueue');
    
    if (appState.stories.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-4">
                <p class="text-sm">No stories yet</p>
            </div>
        `;
        return;
    }

    container.innerHTML = appState.stories.map((story, index) => {
        const isCurrent = index === appState.currentStoryIndex;
        const isCompleted = story.finalPoints !== null;
        
        return `
            <div class="p-3 rounded-lg border transition-all cursor-pointer ${
                isCurrent 
                    ? 'bg-yellow-500/20 border-yellow-500/50' 
                    : isCompleted 
                        ? 'bg-enchanted-500/10 border-enchanted-500/30' 
                        : 'bg-white/5 border-white/10 hover:border-mystic-500/50'
            }" onclick="selectStory(${index})">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-sm truncate ${isCurrent ? 'text-yellow-300' : 'text-white'}">${story.title}</h4>
                        ${story.description ? `<p class="text-xs text-gray-400 truncate mt-1">${story.description}</p>` : ''}
                    </div>
                    ${isCompleted ? `
                        <span class="flex-shrink-0 w-8 h-8 bg-enchanted-500/30 border border-enchanted-400 rounded-full flex items-center justify-center">
                            <span class="font-bold text-sm text-enchanted-300">${story.finalPoints}</span>
                        </span>
                    ` : isCurrent ? `
                        <span class="flex-shrink-0">
                            <svg class="w-5 h-5 text-yellow-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Select story (host only)
function selectStory(index) {
    if (!appState.isHost) return;
    
    const story = appState.stories[index];
    if (story.finalPoints !== null) {
        // Show historical card instead of selecting for vote
        socket.emit('viewHistoricalCard', { storyIndex: index });
        return;
    }
    
    socket.emit('selectStory', { storyIndex: index });
}

// Render current story card
function renderCurrentCard() {
    const placeholder = document.getElementById('cardPlaceholder');
    const content = document.getElementById('cardContent');
    const title = document.getElementById('currentStoryTitle');
    const description = document.getElementById('currentStoryDescription');
    const finalPointsDisplay = document.getElementById('finalPointsDisplay');
    const finalPointsValue = document.getElementById('finalPointsValue');
    const cardHint = document.getElementById('cardHint');

    if (!appState.currentStory) {
        placeholder.classList.remove('hidden');
        content.classList.add('hidden');
        finalPointsDisplay.classList.add('hidden');
        cardHint.classList.add('hidden');
        return;
    }

    placeholder.classList.add('hidden');
    content.classList.remove('hidden');
    title.textContent = appState.currentStory.title;
    description.textContent = appState.currentStory.description || '';

    if (appState.currentStory.finalPoints !== null) {
        finalPointsDisplay.classList.remove('hidden');
        finalPointsValue.textContent = appState.currentStory.finalPoints;
    } else {
        finalPointsDisplay.classList.add('hidden');
    }

    if (appState.votesRevealed) {
        cardHint.classList.remove('hidden');
    } else {
        cardHint.classList.add('hidden');
    }
}

// Flip card
function flipCard() {
    if (!appState.votesRevealed) return;
    
    const cardInner = document.getElementById('cardInner');
    appState.cardFlipped = !appState.cardFlipped;
    
    if (appState.cardFlipped) {
        cardInner.classList.add('flipped');
    } else {
        cardInner.classList.remove('flipped');
    }
}

// Reset card flip
function resetCardFlip() {
    const cardInner = document.getElementById('cardInner');
    cardInner.classList.remove('flipped');
    appState.cardFlipped = false;
}

// Render vote results on card back
function renderVoteResults(votes) {
    const container = document.getElementById('voteResults');
    const voteEntries = Object.values(votes);

    if (voteEntries.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400">No votes cast</p>';
        return;
    }

    container.innerHTML = voteEntries.map(vote => `
        <div class="flex items-center justify-between p-2 bg-white/5 rounded-lg">
            <span class="text-sm text-gray-300">${vote.odeName || vote.voterName}</span>
            <span class="font-bold text-lg text-yellow-400">${vote.value}</span>
        </div>
    `).join('');
}

// Cast vote
function castVote(value) {
    if (!appState.votingActive || appState.votesRevealed || appState.currentRole !== 'player') return;

    appState.myVote = value;
    socket.emit('vote', { value });

    // Update UI
    document.querySelectorAll('.vote-card').forEach(card => {
        if (card.dataset.value === String(value)) {
            card.classList.add('selected', 'bg-gradient-to-br', 'from-enchanted-500', 'to-enchanted-700', 'border-enchanted-300');
        } else {
            card.classList.remove('selected', 'from-enchanted-500', 'to-enchanted-700', 'border-enchanted-300');
        }
    });

    showToast(`You voted: ${value}`, 'success');
}

// Update voting status
function updateVotingStatus() {
    const status = document.getElementById('votingStatus');
    const revealBtn = document.getElementById('revealBtn');

    if (!appState.votingActive && !appState.votesRevealed) {
        status.textContent = 'Waiting for host to select a story...';
        return;
    }

    if (appState.votesRevealed) {
        status.textContent = 'Voting complete!';
        return;
    }

    status.textContent = `${appState.voteCount} of ${appState.playerCount} players voted`;

    // Update reveal button state
    if (revealBtn) {
        if (appState.voteCount > 0) {
            revealBtn.disabled = false;
            revealBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            revealBtn.disabled = true;
            revealBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
}

// Show host controls
function updateHostControls() {
    const hostControls = document.getElementById('hostControls');
    const hostStoryPanel = document.getElementById('hostStoryPanel');

    if (appState.isHost && appState.votingActive && !appState.votesRevealed) {
        hostControls.classList.remove('hidden');
    } else {
        hostControls.classList.add('hidden');
    }

    // Show/hide story panel for host
    if (appState.isHost) {
        hostStoryPanel.classList.remove('hidden');
    } else {
        hostStoryPanel.classList.add('hidden');
    }
}

// Reveal votes (host only)
function revealVotes() {
    if (!appState.isHost) return;
    socket.emit('revealVotes');
}

// Show countdown
function showCountdown() {
    const overlay = document.getElementById('countdownOverlay');
    const numberDiv = document.getElementById('countdownNumber');
    
    overlay.classList.remove('hidden');
    
    const numbers = [3, 2, 1];
    let index = 0;

    function showNumber() {
        if (index < numbers.length) {
            numberDiv.textContent = numbers[index];
            numberDiv.classList.remove('animate-countdown');
            void numberDiv.offsetWidth; // Trigger reflow
            numberDiv.classList.add('animate-countdown');
            index++;
            setTimeout(showNumber, 800);
        } else {
            overlay.classList.add('hidden');
        }
    }

    showNumber();
}

// Show consensus animation
function showConsensusAnimation(allSame, consensus) {
    const card = document.getElementById('storyCard');
    const cardInner = document.getElementById('cardInner');
    const resultBanner = document.getElementById('resultBanner');
    
    if (allSame) {
        // CONSENSUS: Fireworks + Golden Glow + Celebration
        card.classList.add('animate-golden-pulse');
        createFireworks();
        createConfetti();
        
        // Show consensus banner
        resultBanner.classList.remove('hidden');
        resultBanner.innerHTML = `
            <div class="consensus-banner bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 px-6 py-2 rounded-full shadow-lg">
                <span class="font-fantasy text-lg font-bold text-black flex items-center gap-2 whitespace-nowrap">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    CONSENSUS!
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                </span>
            </div>
        `;
        
        setTimeout(() => {
            card.classList.remove('animate-golden-pulse');
        }, 3000);
    } else {
        // DISPUTE: Thunder shake + Red/Orange Glow + Auto-flip
        card.classList.add('animate-thunder-shake', 'animate-dispute-glow');
        
        // Show dispute banner
        resultBanner.classList.remove('hidden');
        resultBanner.innerHTML = `
            <div class="dispute-banner bg-gradient-to-r from-red-600 via-orange-500 to-red-600 px-6 py-2 rounded-full shadow-lg">
                <span class="font-fantasy text-lg font-bold text-white flex items-center gap-2 whitespace-nowrap">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    NO CONSENSUS
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </span>
            </div>
        `;
        
        // Auto-flip card after shake animation
        setTimeout(() => {
            card.classList.remove('animate-thunder-shake');
            if (!appState.cardFlipped) {
                cardInner.classList.add('flipped');
                appState.cardFlipped = true;
            }
        }, 600);
        
        setTimeout(() => {
            card.classList.remove('animate-dispute-glow');
        }, 3000);
    }
}

// Create confetti effect
function createConfetti() {
    const colors = ['#ffd700', '#ff8c00', '#8b5cf6', '#10b981', '#f97316'];
    
    for (let i = 0; i < 80; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.top = '-10px';
        confetti.style.width = (Math.random() * 8 + 6) + 'px';
        confetti.style.height = (Math.random() * 8 + 6) + 'px';
        confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
        document.body.appendChild(confetti);

        const animation = confetti.animate([
            { top: '-10px', transform: `rotate(0deg) translateX(0)`, opacity: 1 },
            { top: '100vh', transform: `rotate(${Math.random() * 720}deg) translateX(${(Math.random() - 0.5) * 200}px)`, opacity: 0.5 }
        ], {
            duration: 2500 + Math.random() * 1500,
            easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        });

        animation.onfinish = () => confetti.remove();
    }
}

// Create fireworks effect
function createFireworks() {
    const card = document.getElementById('storyCard');
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const colors = ['#ffd700', '#ff8c00', '#ff4500', '#ffff00', '#ffa500'];
    
    // Create multiple bursts
    for (let burst = 0; burst < 5; burst++) {
        setTimeout(() => {
            const burstX = centerX + (Math.random() - 0.5) * 300;
            const burstY = centerY + (Math.random() - 0.5) * 200 - 50;
            
            for (let i = 0; i < 20; i++) {
                const firework = document.createElement('div');
                firework.className = 'firework';
                firework.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                firework.style.position = 'fixed';
                firework.style.left = burstX + 'px';
                firework.style.top = burstY + 'px';
                firework.style.zIndex = '1000';
                firework.style.boxShadow = `0 0 6px ${colors[Math.floor(Math.random() * colors.length)]}`;
                document.body.appendChild(firework);

                const angle = (i / 20) * Math.PI * 2;
                const velocity = 80 + Math.random() * 60;
                const endX = Math.cos(angle) * velocity;
                const endY = Math.sin(angle) * velocity;

                const animation = firework.animate([
                    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                    { transform: `translate(${endX}px, ${endY}px) scale(0)`, opacity: 0 }
                ], {
                    duration: 800 + Math.random() * 400,
                    easing: 'cubic-bezier(0, 0.5, 0.5, 1)'
                });

                animation.onfinish = () => firework.remove();
            }
        }, burst * 200);
    }
}

// Show points assignment on card back (when no consensus)
function showPointsAssignment() {
    const cardContainer = document.getElementById('hostPointsOnCard');
    const pointsContainer = document.getElementById('pointOptionsContainer');
    
    if (!appState.isHost) {
        cardContainer.classList.add('hidden');
        return;
    }

    // Get all unique vote values
    const allVoteValues = Object.values(appState.votes).map(v => v.value);
    
    // Separate numeric and special votes
    const numericVotes = allVoteValues
        .filter(v => !isNaN(Number(v)) && v !== '?' && v !== '☕')
        .map(v => Number(v));
    
    const specialVotes = allVoteValues.filter(v => v === '?' || v === '☕');
    
    // Get unique values, sorted numerically for numbers
    const uniqueNumeric = [...new Set(numericVotes)].sort((a, b) => a - b);
    const uniqueSpecial = [...new Set(specialVotes)];
    const allUniqueVotes = [...uniqueNumeric, ...uniqueSpecial];
    
    if (allUniqueVotes.length === 0) {
        cardContainer.classList.add('hidden');
        return;
    }
    
    const buttonsHtml = allUniqueVotes.map(value => `
        <button onclick="assignPoints(${typeof value === 'number' ? value : "'" + value + "'"})"
            class="point-option-btn w-12 h-12 bg-gradient-to-br from-flame-500 to-flame-700 hover:from-flame-400 hover:to-flame-600 rounded-lg font-fantasy text-lg font-bold text-white border-2 border-flame-400 shadow-lg shadow-flame-500/30 transition-all transform hover:scale-110">
            ${value}
        </button>
    `).join('');
    
    // Show on card back only
    cardContainer.classList.remove('hidden');
    pointsContainer.innerHTML = buttonsHtml;
}

// Assign points
function assignPoints(points) {
    if (!appState.isHost) return;
    socket.emit('assignPoints', { points });
    document.getElementById('hostPointsOnCard').classList.add('hidden');
}

// Assign custom points
function assignCustomPoints() {
    const input = document.getElementById('customPoints');
    const points = parseInt(input.value);
    if (!isNaN(points) && points >= 0) {
        assignPoints(points);
    } else {
        showToast('Please enter a valid number', 'warning');
    }
}

// Accept consensus
function acceptConsensus(points) {
    if (!appState.isHost) return;
    socket.emit('acceptConsensus', { points });
    // Hide the result banner after accepting
    document.getElementById('resultBanner').classList.add('hidden');
}

// Render consensus status
function renderConsensusStatus(allSame, consensus) {
    const container = document.getElementById('consensusStatus');
    const hostPointsOnCard = document.getElementById('hostPointsOnCard');

    if (allSame && consensus !== null) {
        hostPointsOnCard.classList.add('hidden');
        container.innerHTML = `
            <div class="text-center">
                <div class="inline-flex items-center gap-3">
                    <div class="w-14 h-14 bg-gradient-to-br from-enchanted-400 to-enchanted-600 rounded-full flex items-center justify-center border-2 border-enchanted-300 shadow-lg shadow-enchanted-500/50">
                        <span class="font-fantasy text-2xl font-bold text-white">${consensus}</span>
                    </div>
                    ${appState.isHost ? `
                        <button onclick="acceptConsensus(${typeof consensus === 'number' ? consensus : "'" + consensus + "'"})" 
                            class="px-4 py-2 bg-gradient-to-r from-enchanted-500 to-enchanted-600 hover:from-enchanted-400 hover:to-enchanted-500 rounded-lg text-sm font-bold text-white transition-all transform hover:scale-105 shadow-lg">
                            ✓ Accept
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="text-center">
                <p class="text-gray-400 text-xs">Host will assign final points</p>
            </div>
        `;
    }
}

// Render members list
function renderMembers() {
    const container = document.getElementById('membersList');

    container.innerHTML = appState.members.map(member => {
        const hasVoted = appState.votedMembers.includes(member.id);
        
        return `
            <div class="member-badge p-2 rounded-lg ${member.isHost ? 'bg-yellow-500/20 border border-yellow-500/30' : 'bg-white/5 border border-white/10'} flex items-center gap-2">
                <div class="flex-shrink-0">
                    ${getMemberIcon(member)}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-sm truncate ${member.isHost ? 'text-yellow-300' : 'text-white'}">${member.name}</p>
                    <p class="text-xs ${member.role === 'player' ? 'text-enchanted-400' : 'text-gray-400'}">${member.role}</p>
                </div>
                ${appState.votingActive && member.role === 'player' ? `
                    <div class="flex-shrink-0">
                        ${hasVoted 
                            ? `<svg class="w-5 h-5 text-enchanted-400" fill="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
                            : `<svg class="w-5 h-5 text-gray-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
                        }
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Get member icon SVG
function getMemberIcon(member) {
    if (member.isHost) {
        return `<svg class="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
        </svg>`;
    } else if (member.role === 'player') {
        return `<svg class="w-8 h-8 text-enchanted-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>`;
    } else {
        return `<svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
        </svg>`;
    }
}

// Toggle history panel
function toggleHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        renderHistory();
    }
}

// Render history
function renderHistory() {
    const container = document.getElementById('historyList');
    const completedStories = appState.stories.filter(s => s.finalPoints !== null);

    if (completedStories.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <svg class="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
                <p class="text-sm">No completed stories yet</p>
            </div>
        `;
        return;
    }

    container.innerHTML = completedStories.map((story, index) => {
        const originalIndex = appState.stories.indexOf(story);
        const isActive = originalIndex === appState.currentStoryIndex;
        
        return `
            <div class="p-3 rounded-lg border ${isActive ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-white/5 border-white/10 hover:border-mystic-500/50'} transition-all cursor-pointer"
                onclick="viewHistoricalCard(${originalIndex})">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-sm ${isActive ? 'text-yellow-300' : 'text-white'}">${story.title}</h4>
                        ${story.description ? `<p class="text-xs text-gray-400 line-clamp-2 mt-1">${story.description}</p>` : ''}
                    </div>
                    <div class="flex-shrink-0 w-10 h-10 bg-enchanted-500/30 border border-enchanted-400 rounded-full flex items-center justify-center animate-pulse-glow">
                        <span class="font-bold text-lg text-enchanted-300">${story.finalPoints}</span>
                    </div>
                </div>
                <div class="mt-2 flex flex-wrap gap-1">
                    ${Object.values(story.votes || {}).map(v => `
                        <span class="text-xs px-2 py-0.5 bg-mystic-600/30 rounded-full text-mystic-300">${v.odeName || v.voterName}: ${v.value}</span>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// View historical card
function viewHistoricalCard(storyIndex) {
    if (!appState.isHost) return;
    socket.emit('viewHistoricalCard', { storyIndex });
}

// Leave room
function leaveRoom() {
    if (confirm('Are you sure you want to leave the room?')) {
        socket.emit('leaveRoom');
        window.location.reload();
    }
}

// Switch to room view
function switchToRoom() {
    homePage.classList.add('hidden');
    roomPage.classList.remove('hidden');
}

// Update room display
function updateRoomDisplay() {
    document.getElementById('roomNameDisplay').textContent = appState.roomName;
    document.getElementById('roomCodeDisplay').textContent = appState.roomCode;
}

// === Socket Event Handlers ===

socket.on('roomCreated', (data) => {
    appState.roomCode = data.roomCode;
    appState.roomName = data.roomName;
    appState.isHost = data.isHost;
    appState.members = data.members;
    appState.stories = data.stories;
    appState.currentRole = 'player';

    updateRoomDisplay();
    updateRoleDisplay();
    updateHostControls();
    renderMembers();
    renderStoryQueue();
    updateVotingStatus();
    switchToRoom();

    showToast(`Room created! Code: ${data.roomCode}`, 'success');
});

socket.on('roomJoined', (data) => {
    appState.roomCode = data.roomCode;
    appState.roomName = data.roomName;
    appState.isHost = data.isHost;
    appState.members = data.members;
    appState.stories = data.stories;
    appState.currentStoryIndex = data.currentStoryIndex;
    appState.currentStory = data.currentStory;
    appState.votingActive = data.votingActive;
    appState.votesRevealed = data.votesRevealed;
    appState.votes = data.votes;
    appState.currentRole = 'player';

    // Find self and set role
    const self = appState.members.find(m => m.id === socket.id);
    if (self) {
        appState.currentRole = self.role;
    }

    updateRoomDisplay();
    updateRoleDisplay();
    updateHostControls();
    renderMembers();
    renderStoryQueue();
    renderCurrentCard();
    updateVotingStatus();
    
    if (appState.votesRevealed) {
        renderVoteResults(appState.votes);
    }

    switchToRoom();
    showToast(`Joined room: ${data.roomName}`, 'success');
});

socket.on('error', (data) => {
    showError(data.message);
    showToast(data.message, 'error');
});

socket.on('memberJoined', (data) => {
    appState.members = data.members;
    renderMembers();
    showToast(`${data.member.name} joined`, 'info');
});

socket.on('memberLeft', (data) => {
    appState.members = data.members;
    renderMembers();
    if (data.member) {
        showToast(`${data.member.name} left`, 'info');
    }
});

socket.on('memberUpdated', (data) => {
    appState.members = data.members;
    
    // Update own role if it's us
    if (data.member.id === socket.id) {
        appState.currentRole = data.member.role;
        updateRoleDisplay();
    }
    
    renderMembers();
});

socket.on('hostChanged', (data) => {
    appState.members = data.members;
    
    // Check if we're the new host
    const self = appState.members.find(m => m.id === socket.id);
    if (self && self.isHost) {
        appState.isHost = true;
        showToast('You are now the host!', 'success');
    }
    
    updateHostControls();
    renderMembers();
    showToast(`${data.newHost.name} is now the host`, 'info');
});

socket.on('storyAdded', (data) => {
    appState.stories = data.stories;
    renderStoryQueue();
    showToast(`New story added: ${data.story.title}`, 'info');
});

socket.on('storySelected', (data) => {
    appState.currentStoryIndex = data.currentStoryIndex;
    appState.currentStory = data.currentStory;
    appState.votingActive = data.votingActive;
    appState.votesRevealed = data.votesRevealed;
    appState.myVote = null;
    appState.votes = {};
    appState.voteCount = 0;
    appState.votedMembers = [];

    // Reset vote card selection
    document.querySelectorAll('.vote-card').forEach(card => {
        card.classList.remove('selected', 'from-enchanted-500', 'to-enchanted-700', 'border-enchanted-300');
    });

    resetCardFlip();
    renderCurrentCard();
    renderStoryQueue();
    updateVotingStatus();
    updateHostControls();
    
    // Hide and reset previous voting UI
    document.getElementById('hostPointsOnCard').classList.add('hidden');
    document.getElementById('pointsAssignment').classList.add('hidden');
    document.getElementById('resultBanner').classList.add('hidden');

    showToast(`Voting started: ${data.currentStory.title}`, 'info');
});

socket.on('voteUpdate', (data) => {
    appState.voteCount = data.voteCount;
    appState.playerCount = data.playerCount;
    appState.votedMembers = data.votedMembers;
    updateVotingStatus();
    renderMembers();
});

socket.on('countdownStarted', () => {
    showCountdown();
});

socket.on('votesRevealed', (data) => {
    appState.votes = data.votes;
    appState.votesRevealed = true;
    appState.votingActive = false;

    renderVoteResults(data.votes);
    renderCurrentCard();
    updateHostControls();
    
    // Pass consensus value for the animation
    showConsensusAnimation(data.allSame, data.consensus);
    
    if (data.allSame && data.consensus !== null) {
        // Auto-accept consensus after celebration animation
        if (appState.isHost) {
            setTimeout(() => {
                socket.emit('acceptConsensus', { points: data.consensus });
            }, 1500); // Wait for fireworks to start
        }
        // Don't show manual consensus UI since it auto-accepts
        renderConsensusStatus(false, null);
    } else {
        renderConsensusStatus(data.allSame, data.consensus);
        showPointsAssignment();
    }
});

socket.on('pointsAssigned', (data) => {
    appState.stories = data.stories;
    appState.currentStory = data.story;
    appState.currentStoryIndex = data.storyIndex;
    
    // Also update the story in the array to ensure sync
    if (data.storyIndex >= 0 && data.storyIndex < appState.stories.length) {
        appState.stories[data.storyIndex] = data.story;
    }
    
    // Flip card back to front to show final points
    resetCardFlip();
    
    renderCurrentCard();
    renderStoryQueue();
    renderHistory();
    
    // Hide point selection and banner
    document.getElementById('hostPointsOnCard').classList.add('hidden');
    document.getElementById('pointsAssignment').classList.add('hidden');
    document.getElementById('resultBanner').classList.add('hidden');
    document.getElementById('consensusStatus').innerHTML = '';
    
    showToast(`Story assigned ${data.story.finalPoints} points`, 'success');
});

socket.on('viewingHistoricalCard', (data) => {
    appState.currentStoryIndex = data.storyIndex;
    appState.currentStory = data.story;
    appState.votesRevealed = true;
    appState.votingActive = false;
    appState.votes = data.story.votes || {};

    renderCurrentCard();
    renderVoteResults(data.story.votes || {});
    renderStoryQueue();
    updateHostControls();
    
    // Show consensus status based on historical votes
    const voteValues = Object.values(data.story.votes || {})
        .map(v => v.value)
        .filter(v => typeof v === 'number');
    const allSame = voteValues.length > 0 && voteValues.every(v => v === voteValues[0]);
    renderConsensusStatus(allSame, allSame ? voteValues[0] : null);
});

// Handle disconnect
socket.on('disconnect', () => {
    showToast('Connection lost. Reconnecting...', 'warning');
});

socket.on('connect', () => {
    if (appState.roomCode) {
        showToast('Reconnected!', 'success');
    }
});
