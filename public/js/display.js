// ============= SOCKET.IO CONNECTION =============

const socket = io();

socket.on("connect", () => {
    console.log("Display connected to server");
    socket.emit("join-room", "auction-room");
    updateConnectionStatus(true);
});

socket.on("disconnect", () => {
    console.log("Display disconnected");
    updateConnectionStatus(false);
});

socket.on("connected", (data) => {
    console.log("Socket confirmed:", data.socketId);
});

// ============= SOCKET EVENT LISTENERS =============

// Listen for player selection
socket.on("player-selected", (data) => {
    console.log("Player selected:", data.player.name);
    displayNewPlayer(data.player, data.auctionState);
    if (data.teams) {
        updateTeamsDisplay(data.teams);
    }
});

// Listen for bid updates
socket.on("bid-placed", (data) => {
    console.log("Bid placed:", data.newBid, "by", data.team.teamName);
    updateBidAmount(data.newBid, data.team);
    if (data.teamsData) {
        updateTeamsDisplay(data.teamsData);
    }
    highlightBiddingTeam(data.team._id);
    createBidParticles();
});

// Listen for player sold
socket.on("player-sold", (data) => {
    console.log("Player sold:", data.player.name, "to", data.team.teamName);
    showSoldOverlay(data.player, data.team, data.price);
    createConfetti();

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
socket.on("player-unsold", (data) => {
    console.log("Player unsold:", data.player.name);
    showUnsoldOverlay(data.player);

    setTimeout(() => {
        hideUnsoldOverlay();
        clearPlayerDisplay();
    }, 3000);
});

// Listen for sale undone
socket.on("sale-undone", (data) => {
    console.log("Sale undone:", data.player.name);
    if (data.teamsData) {
        updateTeamsDisplay(data.teamsData);
    }
    updateSoldCount();
});

// Listen for player withdrawn
socket.on("player-withdrawn", (data) => {
    console.log("Player withdrawn:", data.player.name);
    clearPlayerDisplay();
});

// ============= DISPLAY UPDATE FUNCTIONS =============

/**
 * Update connection status indicator
 */
function updateConnectionStatus(connected) {
    const statusEl = document.getElementById("connectionStatus");
    if (statusEl) {
        if (connected) {
            statusEl.textContent = "🟢 Live";
            statusEl.classList.remove("disconnected");
        } else {
            statusEl.textContent = "🔴 Reconnecting...";
            statusEl.classList.add("disconnected");
        }
    }
}

/**
 * Display a new player on the screen
 */
function displayNewPlayer(player, auctionState) {
    const section = document.getElementById("currentPlayerSection");
    if (!section) return;

    const imageHtml = player.imageUrl
        ? `
        <div class="player-image-container">
            <img src="${player.imageUrl}" alt="${player.name}" class="player-image" onerror="this.style.display='none'">
        </div>
    `
        : "";

    const playerTypeHtml = player.playerType
        ? `
        <div class="player-display-info">
            <span class="player-type-badge">${player.playerType}</span>
        </div>
    `
        : "";

    section.innerHTML = `
        <div class="player-display fade-in">
            ${imageHtml}
            <div class="player-display-left">
                <div class="player-display-number">#${player.playerNumber}</div>
                <h2 class="player-display-name">${player.name}</h2>
                ${playerTypeHtml}
                <div class="player-display-base">
                    Base Price: ₹${player.basePrice.toLocaleString("en-IN")}
                </div>
            </div>
            
            <div class="player-display-right">
                <div class="current-bid-section">
                    <div class="bid-header">CURRENT BID</div>
                    <div class="bid-display-amount" id="displayBidAmount">
                        ₹${(
                            auctionState?.currentBid || player.basePrice
                        ).toLocaleString("en-IN")}
                    </div>
                    <div class="bid-display-team" id="displayBiddingTeam">
                        Waiting for bids...
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove any highlights from teams
    document.querySelectorAll(".team-display-card").forEach((card) => {
        card.classList.remove("bidding-highlight");
    });
}

/**
 * Update bid amount display
 */
function updateBidAmount(newBid, team) {
    const bidAmountEl = document.getElementById("displayBidAmount");
    const biddingTeamEl = document.getElementById("displayBiddingTeam");

    if (bidAmountEl) {
        bidAmountEl.classList.add("pulse-animation");
        setTimeout(() => {
            bidAmountEl.textContent = "₹" + newBid.toLocaleString("en-IN");
            bidAmountEl.classList.remove("pulse-animation");
        }, 250);
    }

    if (biddingTeamEl) {
        const logoHtml = team.logo
            ? `<img src="${team.logo}" alt="${team.teamName}" style="width: 45px; height: 45px; object-fit: contain; filter: drop-shadow(2px 2px 4px rgba(0, 0, 0, 0.3)); margin-right: 10px; vertical-align: middle;">`
            : "";
        biddingTeamEl.innerHTML = logoHtml + team.teamName;
        biddingTeamEl.style.color = team.color;
        biddingTeamEl.style.textShadow = `0 0 20px ${team.color}`;
    }
}

/**
 * Update teams display grid
 */
function updateTeamsDisplay(teams) {
    if (!teams || !Array.isArray(teams)) return;

    teams.forEach((team) => {
        const card = document.querySelector(
            `.team-display-card[data-team-id="${team._id}"]`
        );
        if (!card) return;

        // Update players count
        const playersEl = card.querySelector(".players-count");
        if (playersEl) {
            playersEl.textContent = `${team.playersCount}/11`;
        }

        // Update progress bar
        const progressFill = card.querySelector(".progress-fill-display");
        if (progressFill) {
            progressFill.style.width = `${(team.playersCount / 11) * 100}%`;
        }

        // Update purse
        const purseEl = card.querySelector(".purse-value");
        if (purseEl) {
            purseEl.textContent =
                "₹" + team.remainingPurse.toLocaleString("en-IN");
        }

        // Update spent
        const spentEl = card.querySelector(".spent-value");
        if (spentEl) {
            const initialPurse = team.initialPurse || 100000;
            const spent = initialPurse - team.remainingPurse;
            spentEl.textContent = "₹" + spent.toLocaleString("en-IN");
        }
    });
}

/**
 * Highlight the bidding team
 */
function highlightBiddingTeam(teamId) {
    // Remove highlight from all cards
    document.querySelectorAll(".team-display-card").forEach((card) => {
        card.classList.remove("bidding-highlight");
    });

    // Add highlight to bidding team
    const biddingCard = document.querySelector(
        `.team-display-card[data-team-id="${teamId}"]`
    );
    if (biddingCard) {
        biddingCard.classList.add("bidding-highlight");
    }
}

/**
 * Show sold overlay
 */
function showSoldOverlay(player, team, price) {
    const overlay = document.getElementById("soldOverlay");
    const playerNameEl = document.getElementById("soldPlayerName");
    const teamNameEl = document.getElementById("soldTeamName");
    const priceEl = document.getElementById("soldPrice");

    if (playerNameEl) playerNameEl.textContent = player.name;
    if (teamNameEl) {
        teamNameEl.textContent = `TO ${team.teamName.toUpperCase()}`;
        teamNameEl.style.color = team.color;
        teamNameEl.style.textShadow = `0 0 30px ${team.color}`;
    }
    if (priceEl) priceEl.textContent = "₹" + price.toLocaleString("en-IN");

    if (overlay) {
        overlay.style.display = "flex";
        setTimeout(() => {
            overlay.classList.add("show-overlay");
        }, 10);
    }
}

/**
 * Hide sold overlay
 */
function hideSoldOverlay() {
    const overlay = document.getElementById("soldOverlay");
    if (overlay) {
        overlay.classList.remove("show-overlay");
        setTimeout(() => {
            overlay.style.display = "none";
        }, 500);
    }
}

/**
 * Show unsold overlay
 */
function showUnsoldOverlay(player) {
    const overlay = document.getElementById("unsoldOverlay");
    const playerNameEl = document.getElementById("unsoldPlayerName");

    if (playerNameEl) playerNameEl.textContent = player.name;

    if (overlay) {
        overlay.style.display = "flex";
        setTimeout(() => {
            overlay.classList.add("show-overlay");
        }, 10);
    }
}

/**
 * Hide unsold overlay
 */
function hideUnsoldOverlay() {
    const overlay = document.getElementById("unsoldOverlay");
    if (overlay) {
        overlay.classList.remove("show-overlay");
        setTimeout(() => {
            overlay.style.display = "none";
        }, 500);
    }
}

/**
 * Clear player display
 */
function clearPlayerDisplay() {
    const section = document.getElementById("currentPlayerSection");
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
    document.querySelectorAll(".team-display-card").forEach((card) => {
        card.classList.remove("bidding-highlight");
    });
}

/**
 * Update round number
 */
function updateRound(roundNumber) {
    const roundEl = document.getElementById("displayRound");
    if (roundEl) {
        roundEl.textContent = roundNumber;
    }
}

/**
 * Update sold count
 */
async function updateSoldCount() {
    try {
        const response = await fetch("/api/display-data");
        const data = await response.json();

        const soldEl = document.getElementById("displaySold");
        if (soldEl && data.soldCount !== undefined) {
            soldEl.textContent = data.soldCount;
        }
    } catch (error) {
        console.error("Error updating sold count:", error);
    }
}

// ============= VISUAL EFFECTS =============

/**
 * Create confetti effect when player is sold
 */
function createConfetti() {
    const colors = ["#fbbf24", "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"];
    const confettiCount = 100;

    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement("div");
        confetti.style.position = "fixed";
        confetti.style.width = "10px";
        confetti.style.height = "10px";
        confetti.style.backgroundColor =
            colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = Math.random() * 100 + "%";
        confetti.style.top = "-10px";
        confetti.style.opacity = "1";
        confetti.style.transform = "rotate(" + Math.random() * 360 + "deg)";
        confetti.style.borderRadius = Math.random() > 0.5 ? "50%" : "0";
        confetti.style.zIndex = "9999";
        confetti.style.pointerEvents = "none";

        document.body.appendChild(confetti);

        const duration = 3000 + Math.random() * 2000;
        const endLeft =
            parseFloat(confetti.style.left) + (Math.random() - 0.5) * 100;

        confetti.animate(
            [
                {
                    top: "-10px",
                    left: confetti.style.left,
                    opacity: 1,
                    transform: "rotate(0deg)",
                },
                {
                    top: "110vh",
                    left: endLeft + "%",
                    opacity: 0,
                    transform: "rotate(" + (360 + Math.random() * 720) + "deg)",
                },
            ],
            {
                duration: duration,
                easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            }
        );

        setTimeout(() => {
            confetti.remove();
        }, duration);
    }
}

/**
 * Create particle effect when bid is placed
 */
function createBidParticles() {
    const bidSection = document.querySelector(".current-bid-section");
    if (!bidSection) return;

    const rect = bidSection.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 15; i++) {
        const particle = document.createElement("div");
        particle.style.position = "fixed";
        particle.style.width = "6px";
        particle.style.height = "6px";
        particle.style.backgroundColor = "#fbbf24";
        particle.style.borderRadius = "50%";
        particle.style.left = centerX + "px";
        particle.style.top = centerY + "px";
        particle.style.zIndex = "9999";
        particle.style.pointerEvents = "none";
        particle.style.boxShadow = "0 0 10px #fbbf24";

        document.body.appendChild(particle);

        const angle = (Math.PI * 2 * i) / 15;
        const distance = 50 + Math.random() * 50;
        const endX = centerX + Math.cos(angle) * distance;
        const endY = centerY + Math.sin(angle) * distance;

        particle.animate(
            [
                {
                    left: centerX + "px",
                    top: centerY + "px",
                    opacity: 1,
                    transform: "scale(1)",
                },
                {
                    left: endX + "px",
                    top: endY + "px",
                    opacity: 0,
                    transform: "scale(0)",
                },
            ],
            {
                duration: 800,
                easing: "ease-out",
            }
        );

        setTimeout(() => {
            particle.remove();
        }, 800);
    }
}

// ============= AUTO-RECONNECT =============

// Auto-refresh connection if disconnected
setInterval(() => {
    if (!socket.connected) {
        console.log("Attempting to reconnect...");
        socket.connect();
    }
}, 5000);

// Polling fallback - refresh data every 30 seconds as backup
setInterval(async () => {
    if (!socket.connected) {
        console.log("Using polling fallback...");
        try {
            const response = await fetch("/api/display-data");
            const data = await response.json();

            if (data.teams) {
                updateTeamsDisplay(data.teams);
            }

            if (data.currentPlayer && data.auctionState?.isActive) {
                displayNewPlayer(data.currentPlayer, data.auctionState);
                if (data.currentBidder) {
                    updateBidAmount(
                        data.auctionState.currentBid,
                        data.currentBidder
                    );
                }
            }
        } catch (error) {
            console.error("Polling fallback error:", error);
        }
    }
}, 30000);
