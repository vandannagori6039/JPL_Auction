// ============= SOCKET.IO CONNECTION =============

const socket = io();

socket.on('connect', () => {
    console.log('Display connected to server');
    socket.emit('join-room', 'auction-room');
    updateConnectionStatus(true);
});

socket.on('disconnect', () => {
    console.log('Display disconnected');
    updateConnectionStatus(false);
});

socket.on('connected', (data) => {
    console.log('Socket confirmed:', data.socketId);
});

// ============= SOCKET EVENT LISTENERS =============

// Listen for player selection
socket.on('player-selected', (data) => {
    console.log('Player selected:', data.player.name);
    displayNewPlayer(data.player, data.auctionState);
    if (data.teams) {
        updateTeamsDisplay(data.teams);
    }
});

// Listen for bid updates
socket.on('bid-placed', (data) => {
    console.log('Bid placed:', data.newBid, 'by', data.team.teamName);
    updateBidAmount(data.newBid, data.team);
    if (data.teamsData) {
        updateTeamsDisplay(data.teamsData);
    }
    highlightBiddingTeam(data.team._id);
});

// Listen for player sold
socket.on('player-sold', (data) => {
    console.log('Player sold:', data.player.name, 'to', data.team.teamName);
    showSoldOverlay(data.player, data.team, data.price);
    
    setTimeout(() => {
        hideSoldOverlay();
        if (data.teamsData) {
            updateTeamsDisplay(data.teamsData);
        }
        clearPlayerDisplay();
        updateRound(data.roundNumber || 0);
        updateSoldCount();
    }, 4000);
});

// Listen for player unsold
socket.on('player-unsold', (data) => {
    console.log('Player unsold:', data.player.name);
    showUnsoldOverlay(data.player);
    
    setTimeout(() => {
        hideUnsoldOverlay();
        clearPlayerDisplay();
    }, 3000);
});

// Listen for sale undone
socket.on('sale-undone', (data) => {
    console.log('Sale undone:', data.player.name);
    if (data.teamsData) {
        updateTeamsDisplay(data.teamsData);
    }
    updateSoldCount();
});

// Listen for player withdrawn
socket.on('player-withdrawn', (data) => {
    console.log('Player withdrawn:', data.player.name);
    clearPlayerDisplay();
});

// ============= DISPLAY UPDATE FUNCTIONS =============

/**
 * Update connection status indicator
 */
function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        if (connected) {
            statusEl.textContent = '🟢 Live';
            statusEl.classList.remove('disconnected');
        } else {
            statusEl.textContent = '🔴 Reconnecting...';
            statusEl.classList.add('disconnected');
        }
    }
}

/**
 * Display a new player on the screen
 */
function displayNewPlayer(player, auctionState) {
    const section = document.getElementById('currentPlayerSection');
    if (!section) return;
    
    section.innerHTML = `
        <div class="player-display fade-in">
            <div class="player-display-left">
                <div class="player-display-number">#${player.playerNumber}</div>
                <h2 class="player-display-name">${player.name}</h2>
                <div class="player-display-category">
                    <span class="category-badge cat-${player.category}">
                        CATEGORY ${player.category}
                    </span>
                </div>
                <div class="player-display-base">
                    Base Price: ₹${player.basePrice.toLocaleString('en-IN')}
                </div>
            </div>
            
            <div class="player-display-right">
                <div class="current-bid-section">
                    <div class="bid-header">CURRENT BID</div>
                    <div class="bid-display-amount" id="displayBidAmount">
                        ₹${(auctionState?.currentBid || player.basePrice).toLocaleString('en-IN')}
                    </div>
                    <div class="bid-display-team" id="displayBiddingTeam">
                        Waiting for bids...
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove any highlights from teams
    document.querySelectorAll('.team-display-card').forEach(card => {
        card.classList.remove('bidding-highlight');
    });
}

/**
 * Update bid amount display
 */
function updateBidAmount(newBid, team) {
    const bidAmountEl = document.getElementById('displayBidAmount');
    const biddingTeamEl = document.getElementById('displayBiddingTeam');
    
    if (bidAmountEl) {
        bidAmountEl.classList.add('pulse-animation');
        setTimeout(() => {
            bidAmountEl.textContent = '₹' + newBid.toLocaleString('en-IN');
            bidAmountEl.classList.remove('pulse-animation');
        }, 200);
    }
    
    if (biddingTeamEl) {
        biddingTeamEl.textContent = team.teamName;
        biddingTeamEl.style.color = team.color;
        biddingTeamEl.style.textShadow = `0 0 10px ${team.color}`;
    }
}

/**
 * Update teams display grid
 */
function updateTeamsDisplay(teams) {
    if (!teams || !Array.isArray(teams)) return;
    
    teams.forEach(team => {
        const card = document.querySelector(`.team-display-card[data-team-id="${team._id}"]`);
        if (!card) return;
        
        // Update players count
        const playersEl = card.querySelector('.players-count');
        if (playersEl) {
            playersEl.textContent = `${team.playersCount}/11`;
        }
        
        // Update progress bar
        const progressFill = card.querySelector('.progress-fill-display');
        if (progressFill) {
            progressFill.style.width = `${(team.playersCount / 11) * 100}%`;
        }
        
        // Update purse
        const purseEl = card.querySelector('.purse-value');
        if (purseEl) {
            purseEl.textContent = '₹' + team.remainingPurse.toLocaleString('en-IN');
        }
        
        // Update spent
        const spentEl = card.querySelector('.spent-value');
        if (spentEl) {
            const initialPurse = team.initialPurse || 100000;
            const spent = initialPurse - team.remainingPurse;
            spentEl.textContent = '₹' + spent.toLocaleString('en-IN');
        }
    });
}

/**
 * Highlight the bidding team
 */
function highlightBiddingTeam(teamId) {
    // Remove highlight from all cards
    document.querySelectorAll('.team-display-card').forEach(card => {
        card.classList.remove('bidding-highlight');
    });
    
    // Add highlight to bidding team
    const biddingCard = document.querySelector(`.team-display-card[data-team-id="${teamId}"]`);
    if (biddingCard) {
        biddingCard.classList.add('bidding-highlight');
    }
}

/**
 * Show sold overlay
 */
function showSoldOverlay(player, team, price) {
    const overlay = document.getElementById('soldOverlay');
    const playerNameEl = document.getElementById('soldPlayerName');
    const teamNameEl = document.getElementById('soldTeamName');
    const priceEl = document.getElementById('soldPrice');
    
    if (playerNameEl) playerNameEl.textContent = player.name;
    if (teamNameEl) {
        teamNameEl.textContent = `TO ${team.teamName.toUpperCase()}`;
        teamNameEl.style.color = team.color;
    }
    if (priceEl) priceEl.textContent = '₹' + price.toLocaleString('en-IN');
    
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.classList.add('show-overlay');
    }
}

/**
 * Hide sold overlay
 */
function hideSoldOverlay() {
    const overlay = document.getElementById('soldOverlay');
    if (overlay) {
        overlay.classList.remove('show-overlay');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 500);
    }
}

/**
 * Show unsold overlay
 */
function showUnsoldOverlay(player) {
    const overlay = document.getElementById('unsoldOverlay');
    const playerNameEl = document.getElementById('unsoldPlayerName');
    
    if (playerNameEl) playerNameEl.textContent = player.name;
    
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.classList.add('show-overlay');
    }
}

/**
 * Hide unsold overlay
 */
function hideUnsoldOverlay() {
    const overlay = document.getElementById('unsoldOverlay');
    if (overlay) {
        overlay.classList.remove('show-overlay');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 500);
    }
}

/**
 * Clear player display
 */
function clearPlayerDisplay() {
    const section = document.getElementById('currentPlayerSection');
    if (section) {
        section.innerHTML = `
            <div class="no-auction fade-in">
                <div class="no-auction-content">
                    <h2>NEXT PLAYER COMING SOON</h2>
                    <p>Please wait...</p>
                </div>
            </div>
        `;
    }
    
    // Remove highlights
    document.querySelectorAll('.team-display-card').forEach(card => {
        card.classList.remove('bidding-highlight');
    });
}

/**
 * Update round number
 */
function updateRound(roundNumber) {
    const roundEl = document.getElementById('displayRound');
    if (roundEl) {
        roundEl.textContent = roundNumber;
    }
}

/**
 * Update sold count
 */
async function updateSoldCount() {
    try {
        const response = await fetch('/api/display-data');
        const data = await response.json();
        
        const soldEl = document.getElementById('displaySold');
        if (soldEl && data.soldCount !== undefined) {
            soldEl.textContent = data.soldCount;
        }
    } catch (error) {
        console.error('Error updating sold count:', error);
    }
}

// ============= AUTO-RECONNECT =============

// Auto-refresh connection if disconnected
setInterval(() => {
    if (!socket.connected) {
        console.log('Attempting to reconnect...');
        socket.connect();
    }
}, 5000);

// Polling fallback - refresh data every 30 seconds as backup
setInterval(async () => {
    if (!socket.connected) {
        console.log('Using polling fallback...');
        try {
            const response = await fetch('/api/display-data');
            const data = await response.json();
            
            if (data.teams) {
                updateTeamsDisplay(data.teams);
            }
            
            if (data.currentPlayer && data.auctionState?.isActive) {
                displayNewPlayer(data.currentPlayer, data.auctionState);
                if (data.currentBidder) {
                    updateBidAmount(data.auctionState.currentBid, data.currentBidder);
                }
            }
        } catch (error) {
            console.error('Polling fallback error:', error);
        }
    }
}, 30000);
