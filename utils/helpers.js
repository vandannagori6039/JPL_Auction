import Team from '../models/Team.js';

const CATEGORY_CONFIG = {
	A: { basePrice: 5000, minIncrement: 500 },
	B: { basePrice: 3000, minIncrement: 300 },
	C: { basePrice: 2000, minIncrement: 200 },
};

const MIN_BASE_PRICE = 2000;

export const calculateMaxBid = async (teamId) => {
	const team = await Team.findById(teamId).lean();

	if (!team) {
		return 0;
	}

	const playersCount = team.playersCount ?? 0;
	const playersNeeded = Math.max(11 - playersCount, 0);

	if (playersNeeded <= 0) {
		return 0;
	}

	const reserveAmount = Math.max(playersNeeded - 1, 0) * MIN_BASE_PRICE;
	const maxBid = (team.remainingPurse ?? 0) - reserveAmount;

	return Math.max(maxBid, 0);
};

// Simpler version that doesn't need DB query
export const calculateMaxBidDirect = (remainingPurse, playersCount) => {
	const playersNeeded = Math.max(11 - playersCount, 0);

	if (playersNeeded <= 0) {
		return 0;
	}

	const reserveAmount = Math.max(playersNeeded - 1, 0) * MIN_BASE_PRICE;
	const maxBid = remainingPurse - reserveAmount;

	return Math.max(maxBid, 0);
};

export const canTeamBid = async (teamId, bidAmount) => {
	const team = await Team.findById(teamId).lean();

	if (!team) {
		return { canBid: false, reason: 'Team not found', maxBid: 0 };
	}

	if ((team.playersCount ?? 0) >= 11) {
		return { canBid: false, reason: 'Team already has 11 players', maxBid: 0 };
	}

	const maxBid = await calculateMaxBid(teamId);

	if (bidAmount <= maxBid) {
		return { canBid: true, maxBid };
	}

	return {
		canBid: false,
		reason: `Bid exceeds max allowed (${maxBid})`,
		maxBid,
	};
};

export const getCategoryConfig = (category) => CATEGORY_CONFIG[category] || null;

const VALID_PLAYER_TYPES = [
	'Batsman',
	'Bowler',
	'Batting All Rounder',
	'Bowling All Rounder',
	'Wicket Keeper Batsman',
];

export const validatePlayerData = (playerData = {}) => {
	const errors = [];
	const { name, phoneNumber, category, playerType, jerseySize } = playerData;

	if (!name) errors.push('Name is required');
	if (!phoneNumber) errors.push('Phone number is required');
	if (phoneNumber && !/^\d{10}$/.test(phoneNumber)) {
		errors.push('Phone number must be 10 digits');
	}
	if (!category) errors.push('Category is required');
	if (category && !['A', 'B', 'C'].includes(category)) {
		errors.push('Category must be A, B, or C');
	}
	if (!playerType) errors.push('Player type is required');
	if (playerType && !VALID_PLAYER_TYPES.includes(playerType)) {
		errors.push('Invalid player type selected');
	}
	if (!jerseySize) errors.push('Jersey size is required');
	if (jerseySize && !['S', 'M', 'L', 'XL', 'XXL', 'XXXL'].includes(jerseySize)) {
		errors.push('Invalid jersey size selected');
	}

	return { isValid: errors.length === 0, errors };
};

export const formatCurrency = (amount = 0) => {
	const formatter = new Intl.NumberFormat('en-IN', {
		style: 'currency',
		currency: 'INR',
		maximumFractionDigits: 0,
	});

	return formatter.format(amount);
};

export default {
	calculateMaxBid,
	calculateMaxBidDirect,
	canTeamBid,
	getCategoryConfig,
	validatePlayerData,
	formatCurrency,
};
