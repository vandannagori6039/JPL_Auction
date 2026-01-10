/**
 * Migration script to fix players with 'bidding' status
 * This script changes all players with status 'bidding' to 'unsold'
 * Run this once after removing the 'bidding' status from the schema
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Player from './models/Player.js';
import AuctionState from './models/AuctionState.js';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jpl-auction';

async function fixBiddingStatus() {
	try {
		// Connect to MongoDB
		await mongoose.connect(MONGODB_URI);
		console.log('✓ Connected to MongoDB');

		// Find all players with 'bidding' status
		// Note: This query will work even though 'bidding' is no longer in the enum
		const biddingPlayers = await Player.find({ status: 'bidding' });

		console.log(`Found ${biddingPlayers.length} players with 'bidding' status`);

		if (biddingPlayers.length > 0) {
			// Update all players to 'unsold'
			const result = await Player.updateMany(
				{ status: 'bidding' },
				{ $set: { status: 'unsold' } }
			);

			console.log(`✓ Updated ${result.modifiedCount} players from 'bidding' to 'unsold'`);

			// List the updated players
			biddingPlayers.forEach((player) => {
				console.log(`  - ${player.name} (#${player.playerNumber})`);
			});
		} else {
			console.log('✓ No players with "bidding" status found - database is clean!');
		}

		// Check auction state
		const auctionState = await AuctionState.findOne();
		if (auctionState && auctionState.currentPlayer) {
			console.log(
				`\nNote: Auction state has a current player (ID: ${auctionState.currentPlayer})`
			);
			console.log('This is normal - the player will remain in auction state until sold/unsold');
		}

		console.log('\n✓ Migration completed successfully!');
	} catch (error) {
		console.error('Error during migration:', error);
		process.exit(1);
	} finally {
		// Close database connection
		await mongoose.connection.close();
		console.log('✓ Database connection closed');
	}
}

// Run the migration
fixBiddingStatus();
