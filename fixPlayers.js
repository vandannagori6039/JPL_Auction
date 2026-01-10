import mongoose from 'mongoose';
import Player from './models/Player.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jpl-auction';

const CATEGORY_BASE_PRICE = {
	A: 10000,
	B: 5000,
	C: 2000,
	D: 1000,
};

async function fixPlayers() {
	try {
		await mongoose.connect(MONGODB_URI);
		console.log('Connected to MongoDB');

		const players = await Player.find({});
		let fixedCount = 0;

		console.log(`Found ${players.length} players. Checking for issues...`);

		for (const player of players) {
			let needsSave = false;

			// Fix missing basePrice
			if (!player.basePrice && player.category) {
				player.basePrice = CATEGORY_BASE_PRICE[player.category];
				console.log(`Fixed basePrice for ${player.name}: ${player.basePrice}`);
				needsSave = true;
			}

			// Fix missing currentPrice
			if (!player.currentPrice && player.basePrice) {
				player.currentPrice = player.basePrice;
				needsSave = true;
			}

			// Fix missing jerseySize (set default)
			if (!player.jerseySize) {
				player.jerseySize = 'L'; // Default to Large
				console.log(`Set default jersey size for ${player.name}: L`);
				needsSave = true;
			}

			// Fix missing playerType (set default based on name heuristics)
			if (!player.playerType) {
				player.playerType = 'Batsman'; // Default
				console.log(`Set default player type for ${player.name}: Batsman`);
				needsSave = true;
			}

			if (needsSave) {
				await player.save();
				fixedCount++;
			}
		}

		console.log(`\n✅ Fixed ${fixedCount} players`);

		await mongoose.connection.close();
		console.log('Done!');
	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
}

fixPlayers();
