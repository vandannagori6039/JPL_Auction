import Player from '../models/Player.js';
import Team from '../models/Team.js';
import AuctionState from '../models/AuctionState.js';
import {
	calculateMaxBid,
	calculateMaxBidDirect,
	canTeamBid,
	getCategoryConfig,
} from '../utils/helpers.js';

// ============= HELPER FUNCTIONS =============

/**
 * Get or create auction state (singleton pattern)
 */
const getOrCreateAuctionState = async () => {
	let auctionState = await AuctionState.findOne();
	if (!auctionState) {
		auctionState = new AuctionState();
		await auctionState.save();
	}
	return auctionState;
};

/**
 * Get random unsold player, optionally filtered by category
 */
const getRandomUnsoldPlayer = async (category = null) => {
	const query = { status: 'unsold' };
	if (category) {
		query.category = category;
	}

	const players = await Player.find(query);
	if (players.length === 0) {
		return null;
	}

	const randomIndex = Math.floor(Math.random() * players.length);
	return players[randomIndex];
};

/**
 * Get teams with max bid calculated for each
 */
const getTeamsWithMaxBid = async () => {
	const teams = await Team.find().sort('teamNumber').lean();
	return teams.map((team) => ({
		...team,
		maxBidAllowed: calculateMaxBidDirect(team.remainingPurse, team.playersCount),
	}));
};

/**
 * Group players by category
 */
const groupPlayersByCategory = (players) => {
	const grouped = { A: 0, B: 0, C: 0, D: 0 };
	players.forEach((player) => {
		if (grouped[player.category] !== undefined) {
			grouped[player.category]++;
		}
	});
	return grouped;
};

// ============= MAIN CONTROLLER FUNCTIONS =============

/**
 * Show auction control page
 */
export const showAuctionControl = async (req, res) => {
	try {
		// Get or create auction state
		const auctionState = await getOrCreateAuctionState();

		// Clear current player on page refresh to prevent automatic selection
		// This ensures a clean state when the admin refreshes the page
		auctionState.currentPlayer = null;
		auctionState.currentBid = 0;
		auctionState.currentBidder = null;
		auctionState.isActive = false;
		auctionState.bidHistory = [];
		await auctionState.save();

		// Get all teams with max bid calculated
		const teams = await getTeamsWithMaxBid();

		// No current player on page load
		let currentPlayer = null;

		// No current bidder on page load
		let currentBidderInfo = null;

		// Get unsold players
		const unsoldPlayers = await Player.find({ status: 'unsold' }).sort('playerNumber');

		// Group by category
		const unsoldByCategory = groupPlayersByCategory(unsoldPlayers);

		// Calculate statistics
		const soldCount = await Player.countDocuments({ status: 'sold' });
		const unsoldCount = unsoldPlayers.length;
		const withdrawnCount = await Player.countDocuments({ status: 'withdrawn' });

		// Get recent sales
		const recentSales = await Player.find({ status: 'sold' })
			.sort({ updatedAt: -1 })
			.limit(10)
			.populate('soldTo', 'teamName color')
			.lean();

		res.render('admin/auction-control', {
			auctionState: {
				...auctionState.toObject(),
				currentBidder: currentBidderInfo,
			},
			teams,
			currentPlayer,
			unsoldPlayers,
			unsoldByCategory,
			soldCount,
			unsoldCount,
			withdrawnCount,
			recentSales,
		});
	} catch (error) {
		console.error('Error loading auction control:', error);
		res.status(500).render('admin/auction-control', {
			error: 'Failed to load auction control',
			auctionState: {},
			teams: [],
			currentPlayer: null,
			unsoldPlayers: [],
			unsoldByCategory: { A: 0, B: 0, C: 0, D: 0 },
			soldCount: 0,
			unsoldCount: 0,
			withdrawnCount: 0,
			recentSales: [],
		});
	}
};

/**
 * Start auction for a player (random or specific)
 */
export const startAuctionForPlayer = async (playerId, isRandom = false) => {
	try {
		let player;

		if (isRandom && !playerId) {
			// Get random unsold player
			player = await getRandomUnsoldPlayer();
			if (!player) {
				return { success: false, message: 'No unsold players available' };
			}
		} else if (playerId) {
			// Find specific player
			player = await Player.findById(playerId);
			if (!player) {
				return { success: false, message: 'Player not found' };
			}
			if (player.status !== 'unsold') {
				return { success: false, message: 'Player is not available for auction' };
			}
		} else {
			return { success: false, message: 'No player specified' };
		}

		// Don't change player status - keep as 'unsold' until actually sold
		// This prevents the player from disappearing on page reload

		// Get or create auction state
		const auctionState = await getOrCreateAuctionState();

		// Update auction state
		auctionState.currentPlayer = player._id;
		auctionState.currentBid = player.basePrice;
		auctionState.currentBidder = null;
		auctionState.isActive = true;
		auctionState.lastBidTime = new Date();
		auctionState.bidHistory = [];
		await auctionState.save();

		// Get teams data for response
		const teams = await getTeamsWithMaxBid();

		return {
			success: true,
			player: player.toObject(),
			auctionState: auctionState.toObject(),
			teams,
		};
	} catch (error) {
		console.error('Error starting auction:', error);
		return { success: false, message: error.message };
	}
};

/**
 * Place a bid for a team
 */
export const placeBid = async (teamId, customAmount = null) => {
	try {
		// Get current auction state
		const auctionState = await AuctionState.findOne();
		if (!auctionState || !auctionState.isActive) {
			return { success: false, message: 'No active auction' };
		}

		// Get current player
		const player = await Player.findById(auctionState.currentPlayer);
		if (!player) {
			return { success: false, message: 'Current player not found' };
		}

		// Get team
		const team = await Team.findById(teamId);
		if (!team) {
			return { success: false, message: 'Team not found' };
		}

		// Get category config for min increment
		const categoryConfig = getCategoryConfig(player.category);
		const minIncrement = categoryConfig ? categoryConfig.minIncrement : 500;

		// Calculate new bid amount
		let newBidAmount;
		if (customAmount !== null && customAmount !== undefined) {
			newBidAmount = parseInt(customAmount, 10);
			if (newBidAmount <= auctionState.currentBid) {
				return { success: false, message: 'Custom bid must be higher than current bid' };
			}
		} else {
			newBidAmount = auctionState.currentBid + minIncrement;
		}

		// Validate team can afford this bid
		const bidCheck = await canTeamBid(teamId, newBidAmount);
		if (!bidCheck.canBid) {
			return {
				success: false,
				message: bidCheck.reason,
				maxBid: bidCheck.maxBid,
			};
		}

		// Update auction state
		auctionState.currentBid = newBidAmount;
		auctionState.currentBidder = teamId;
		auctionState.lastBidTime = new Date();

		// Add to bid history
		auctionState.bidHistory.push({
			teamId: team._id,
			teamName: team.teamName,
			bidAmount: newBidAmount,
			bidTime: new Date(),
		});

		await auctionState.save();

		// Get updated teams data
		const teams = await getTeamsWithMaxBid();

		return {
			success: true,
			newBid: newBidAmount,
			team: {
				_id: team._id,
				teamName: team.teamName,
				color: team.color,
			},
			minIncrement,
			teamsData: teams,
		};
	} catch (error) {
		console.error('Error placing bid:', error);
		return { success: false, message: error.message };
	}
};

/**
 * Mark current player as sold
 */
export const markPlayerSold = async () => {
	try {
		// Get current auction state
		const auctionState = await AuctionState.findOne();
		if (!auctionState || !auctionState.isActive) {
			return { success: false, message: 'No active auction' };
		}

		if (!auctionState.currentBidder) {
			return { success: false, message: 'No bidder for this player' };
		}

		// Get current player
		const player = await Player.findById(auctionState.currentPlayer);
		if (!player) {
			return { success: false, message: 'Player not found' };
		}

		// Get winning team
		const team = await Team.findById(auctionState.currentBidder);
		if (!team) {
			return { success: false, message: 'Winning team not found' };
		}

		const finalPrice = auctionState.currentBid;

		// Update player
		player.status = 'sold';
		player.soldTo = team._id;
		player.soldPrice = finalPrice;
		await player.save();

		// Update team
		team.remainingPurse -= finalPrice;
		team.playersCount += 1;
		team.players.push({
			playerId: player._id,
			playerName: player.name,
			pricePaid: finalPrice,
			category: player.category,
			boughtAt: new Date(),
		});
		await team.save();

		// Clear auction state
		auctionState.currentPlayer = null;
		auctionState.currentBid = 0;
		auctionState.currentBidder = null;
		auctionState.isActive = false;
		auctionState.roundNumber += 1;
		auctionState.bidHistory = [];
		await auctionState.save();

		// Get updated teams data
		const teams = await getTeamsWithMaxBid();

		return {
			success: true,
			player: {
				_id: player._id,
				name: player.name,
				playerNumber: player.playerNumber,
				category: player.category,
			},
			team: {
				_id: team._id,
				teamName: team.teamName,
				color: team.color,
				remainingPurse: team.remainingPurse,
				playersCount: team.playersCount,
			},
			price: finalPrice,
			teamsData: teams,
		};
	} catch (error) {
		console.error('Error marking player sold:', error);
		return { success: false, message: error.message };
	}
};

/**
 * Mark current player as unsold
 */
export const markPlayerUnsold = async () => {
	try {
		// Get current auction state
		const auctionState = await AuctionState.findOne();
		if (!auctionState || !auctionState.currentPlayer) {
			return { success: false, message: 'No player in auction' };
		}

		// Get current player
		const player = await Player.findById(auctionState.currentPlayer);
		if (!player) {
			return { success: false, message: 'Player not found' };
		}

		// Player is already 'unsold' - no need to update status
		// Just clear the auction state

		// Clear auction state
		auctionState.currentPlayer = null;
		auctionState.currentBid = 0;
		auctionState.currentBidder = null;
		auctionState.isActive = false;
		auctionState.roundNumber += 1;
		auctionState.bidHistory = [];
		await auctionState.save();

		return {
			success: true,
			player: {
				_id: player._id,
				name: player.name,
				playerNumber: player.playerNumber,
			},
		};
	} catch (error) {
		console.error('Error marking player unsold:', error);
		return { success: false, message: error.message };
	}
};

/**
 * Withdraw a player from auction
 */
export const withdrawPlayer = async (playerId) => {
	try {
		const player = await Player.findById(playerId);
		if (!player) {
			return { success: false, message: 'Player not found' };
		}

		// Update player status
		player.status = 'withdrawn';
		await player.save();

		// Check if this is the current auction player
		const auctionState = await AuctionState.findOne();
		if (auctionState && auctionState.currentPlayer?.toString() === playerId) {
			// Clear auction state
			auctionState.currentPlayer = null;
			auctionState.currentBid = 0;
			auctionState.currentBidder = null;
			auctionState.isActive = false;
			auctionState.bidHistory = [];
			await auctionState.save();
		}

		return {
			success: true,
			player: {
				_id: player._id,
				name: player.name,
				playerNumber: player.playerNumber,
			},
		};
	} catch (error) {
		console.error('Error withdrawing player:', error);
		return { success: false, message: error.message };
	}
};

/**
 * Undo the last sale
 */
export const undoLastSale = async () => {
	try {
		// Find the last sold player
		const lastSoldPlayer = await Player.findOne({ status: 'sold' })
			.sort({ updatedAt: -1 })
			.limit(1);

		if (!lastSoldPlayer) {
			return { success: false, message: 'No sold players to undo' };
		}

		// Get the team that bought this player
		const team = await Team.findById(lastSoldPlayer.soldTo);
		if (!team) {
			return { success: false, message: 'Team not found' };
		}

		const refundAmount = lastSoldPlayer.soldPrice;

		// Reverse the transaction
		// 1. Add price back to team purse
		team.remainingPurse += refundAmount;
		// 2. Decrement players count
		team.playersCount = Math.max(0, team.playersCount - 1);
		// 3. Remove player from team's players array
		team.players = team.players.filter(
			(p) => p.playerId.toString() !== lastSoldPlayer._id.toString()
		);
		await team.save();

		// 4. Reset player status
		lastSoldPlayer.status = 'unsold';
		lastSoldPlayer.soldTo = null;
		lastSoldPlayer.soldPrice = 0;
		await lastSoldPlayer.save();

		// Get updated teams data
		const teams = await getTeamsWithMaxBid();

		return {
			success: true,
			player: {
				_id: lastSoldPlayer._id,
				name: lastSoldPlayer.name,
				playerNumber: lastSoldPlayer.playerNumber,
			},
			team: {
				_id: team._id,
				teamName: team.teamName,
				remainingPurse: team.remainingPurse,
			},
			refundAmount,
			teamsData: teams,
		};
	} catch (error) {
		console.error('Error undoing last sale:', error);
		return { success: false, message: error.message };
	}
};

/**
 * Get auction statistics
 */
export const getAuctionStats = async () => {
	try {
		const auctionState = await getOrCreateAuctionState();

		// Count players by status
		const soldCount = await Player.countDocuments({ status: 'sold' });
		const unsoldCount = await Player.countDocuments({ status: 'unsold' });
		const withdrawnCount = await Player.countDocuments({ status: 'withdrawn' });

		// Calculate total money spent
		const soldPlayers = await Player.find({ status: 'sold' }).select('soldPrice category');
		const totalSpent = soldPlayers.reduce((sum, p) => sum + (p.soldPrice || 0), 0);
		const averagePrice = soldCount > 0 ? Math.round(totalSpent / soldCount) : 0;

		// Get highest sold player
		const highestSold = await Player.findOne({ status: 'sold' })
			.sort({ soldPrice: -1 })
			.populate('soldTo', 'teamName color')
			.lean();

		// Category distribution of sold players
		const categoryDistribution = soldPlayers.reduce((acc, player) => {
			acc[player.category] = (acc[player.category] || 0) + 1;
			return acc;
		}, {});

		return {
			success: true,
			roundNumber: auctionState.roundNumber,
			soldCount,
			unsoldCount,
			withdrawnCount,

			totalSpent,
			averagePrice,
			highestSold,
			categoryDistribution,
		};
	} catch (error) {
		console.error('Error getting auction stats:', error);
		return { success: false, message: error.message };
	}
};

/**
 * Get all unsold players, optionally filtered by category
 */
export const getAllUnsoldPlayers = async (category = null) => {
	try {
		const query = { status: 'unsold' };
		if (category && ['A', 'B', 'C', 'D'].includes(category)) {
			query.category = category;
		}

		const players = await Player.find(query)
			.sort('playerNumber')
			.select('_id name playerNumber category basePrice')
			.lean();

		return players;
	} catch (error) {
		console.error('Error getting unsold players:', error);
		return [];
	}
};

/**
 * Start auction for random player from specific category
 */
export const startRandomFromCategory = async (category) => {
	try {
		const player = await getRandomUnsoldPlayer(category);
		if (!player) {
			return { success: false, message: `No unsold players in category ${category}` };
		}

		return startAuctionForPlayer(player._id, false);
	} catch (error) {
		console.error('Error starting random from category:', error);
		return { success: false, message: error.message };
	}
};

export default {
	showAuctionControl,
	startAuctionForPlayer,
	placeBid,
	markPlayerSold,
	markPlayerUnsold,
	withdrawPlayer,
	undoLastSale,
	getAuctionStats,
	getAllUnsoldPlayers,
	startRandomFromCategory,
};
