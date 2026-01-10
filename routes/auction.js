import express from 'express';
import {
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
} from '../controllers/auctionController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = express.Router();

// Main auction control page
router.get('/control', isAuthenticated, showAuctionControl);

// AJAX endpoints for auction operations

// Start auction with random player
router.post('/api/start-random', isAuthenticated, async (req, res) => {
	try {
		const { category } = req.body;
		let result;
		if (category) {
			result = await startRandomFromCategory(category);
		} else {
			result = await startAuctionForPlayer(null, true);
		}
		
		// Emit socket event for real-time updates
		if (result.success && req.io) {
			req.io.to('auction-room').emit('player-selected', result);
		}
		
		res.json(result);
	} catch (error) {
		console.error('Error in start-random:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

// Start auction with specific player
router.post('/api/start-player', isAuthenticated, async (req, res) => {
	try {
		const { playerId } = req.body;
		if (!playerId) {
			return res.status(400).json({ success: false, message: 'Player ID required' });
		}
		
		const result = await startAuctionForPlayer(playerId, false);
		
		// Emit socket event for real-time updates
		if (result.success && req.io) {
			req.io.to('auction-room').emit('player-selected', result);
		}
		
		res.json(result);
	} catch (error) {
		console.error('Error in start-player:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

// Place a bid
router.post('/api/place-bid', isAuthenticated, async (req, res) => {
	try {
		const { teamId, customAmount, increment } = req.body;
		if (!teamId) {
			return res.status(400).json({ success: false, message: 'Team ID required' });
		}
		
		// Determine the final bid amount
		let finalAmount = null;
		
		// Priority: customAmount > increment > default (null for controller to handle)
		if (customAmount !== undefined && customAmount !== null) {
			finalAmount = parseInt(customAmount);
			console.log('Using custom amount:', finalAmount);
		} else if (increment !== undefined && increment !== null) {
			const AuctionState = (await import('../models/AuctionState.js')).default;
			const auctionState = await AuctionState.findOne();
			if (auctionState && auctionState.currentBid !== undefined) {
				finalAmount = auctionState.currentBid + parseInt(increment);
				console.log(`Using increment ${increment}: currentBid ${auctionState.currentBid} + ${increment} = ${finalAmount}`);
			}
		} else {
			console.log('No increment or custom amount, using default category increment');
		}
		
		const result = await placeBid(teamId, finalAmount);
		
		// Emit socket event for real-time updates
		if (result.success && req.io) {
			req.io.to('auction-room').emit('bid-placed', result);
		}
		
		res.json(result);
	} catch (error) {
		console.error('Error in place-bid:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

// Mark player as sold
router.post('/api/mark-sold', isAuthenticated, async (req, res) => {
	try {
		const result = await markPlayerSold();
		
		// Emit socket event for real-time updates
		if (result.success && req.io) {
			req.io.to('auction-room').emit('player-sold', result);
		}
		
		res.json(result);
	} catch (error) {
		console.error('Error in mark-sold:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

// Mark player as unsold
router.post('/api/mark-unsold', isAuthenticated, async (req, res) => {
	try {
		const result = await markPlayerUnsold();
		
		// Emit socket event for real-time updates
		if (result.success && req.io) {
			req.io.to('auction-room').emit('player-unsold', result);
		}
		
		res.json(result);
	} catch (error) {
		console.error('Error in mark-unsold:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

// Withdraw a player
router.post('/api/withdraw-player', isAuthenticated, async (req, res) => {
	try {
		const { playerId } = req.body;
		if (!playerId) {
			return res.status(400).json({ success: false, message: 'Player ID required' });
		}
		
		const result = await withdrawPlayer(playerId);
		
		// Emit socket event for real-time updates
		if (result.success && req.io) {
			req.io.to('auction-room').emit('player-withdrawn', result);
		}
		
		res.json(result);
	} catch (error) {
		console.error('Error in withdraw-player:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

// Undo last sale
router.post('/api/undo-sale', isAuthenticated, async (req, res) => {
	try {
		const result = await undoLastSale();
		
		// Emit socket event for real-time updates
		if (result.success && req.io) {
			req.io.to('auction-room').emit('sale-undone', result);
		}
		
		res.json(result);
	} catch (error) {
		console.error('Error in undo-sale:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

// Get auction statistics
router.get('/api/stats', isAuthenticated, async (req, res) => {
	try {
		const stats = await getAuctionStats();
		res.json(stats);
	} catch (error) {
		console.error('Error in get-stats:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

// Get unsold players list
router.get('/api/unsold-players', isAuthenticated, async (req, res) => {
	try {
		const { category } = req.query;
		const players = await getAllUnsoldPlayers(category);
		res.json(players);
	} catch (error) {
		console.error('Error in get-unsold-players:', error);
		res.status(500).json({ success: false, message: error.message });
	}
});

export default router;
