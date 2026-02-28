import mongoose from 'mongoose';
import Player from './models/Player.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jpl-auction';

const CORRECT_BASE_PRICES = {
	A: 75000,
	B: 30000,
	C: 10000,
};

async function fixBasePrices() {
	try {
		await mongoose.connect(MONGODB_URI);
		console.log('Connected to MongoDB');

		const players = await Player.find({});
		let fixedCount = 0;

		console.log(`Found ${players.length} players. Checking base prices...\n`);

		for (const player of players) {
			const correctBase = CORRECT_BASE_PRICES[player.category];
			if (!correctBase) {
				console.log(`⚠️  ${player.name} has unknown category "${player.category}", skipping.`);
				continue;
			}

			let needsSave = false;

			if (player.basePrice !== correctBase) {
				console.log(
					`${player.name} (Cat ${player.category}): basePrice ₹${player.basePrice} → ₹${correctBase}`
				);
				player.basePrice = correctBase;
				needsSave = true;
			}

			// For unsold players, also reset currentPrice to the correct base price
			if (player.status === 'unsold' && player.currentPrice !== correctBase) {
				console.log(
					`  └─ currentPrice ₹${player.currentPrice} → ₹${correctBase}`
				);
				player.currentPrice = correctBase;
				needsSave = true;
			}

			if (needsSave) {
				await player.save({ validateBeforeSave: false });
				fixedCount++;
			}
		}

		console.log(`\n✅ Fixed ${fixedCount} player(s)`);
		if (fixedCount === 0) {
			console.log('All players already have correct base prices.');
		}
	} catch (error) {
		console.error('Error:', error);
	} finally {
		await mongoose.disconnect();
		console.log('Disconnected from MongoDB');
	}
}

fixBasePrices();
