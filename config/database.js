import mongoose from 'mongoose';

const connectDB = async () => {
	const uri = process.env.MONGODB_URI;

	if (!uri) {
		console.error('MONGODB_URI is not defined');
		process.exit(1);
	}

	try {
		await mongoose.connect(uri, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
		console.log('MongoDB connected');
	} catch (err) {
		console.error('MongoDB connection error:', err);
		process.exit(1);
	}
};

export default connectDB;
