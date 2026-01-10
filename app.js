import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import express from 'express';
import dotenv from 'dotenv';
import session from 'express-session';
import bodyParser from 'body-parser';
import methodOverride from 'method-override';
import { Server } from 'socket.io';

import connectDB from './config/database.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';
import auctionRoutes from './routes/auction.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
	session({
		secret: process.env.SESSION_SECRET || 'change-me',
		resave: false,
		saveUninitialized: false,
	})
);

app.use(methodOverride('_method'));

const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: '*',
		methods: ['GET', 'POST'],
	},
});

// Make io accessible to routes
app.set('io', io);

app.use((req, _res, next) => {
	req.io = io;
	next();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
	console.log('New client connected:', socket.id);

	// Join auction room
	socket.join('auction-room');

	// Send initial connection confirmation
	socket.emit('connected', {
		message: 'Connected to auction server',
		socketId: socket.id,
	});

	// Handle room joining
	socket.on('join-room', (room) => {
		socket.join(room);
		console.log(`Socket ${socket.id} joined room: ${room}`);
	});

	socket.on('disconnect', () => {
		console.log('Client disconnected:', socket.id);
	});
});

app.use('/admin', adminRoutes);
app.use('/auction', auctionRoutes);
app.use('/', publicRoutes);

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/admin/login');
});

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

const start = async () => {
	await connectDB();
	
	// Clean up old logs on startup
	logger.cleanup();
	
	server.listen(PORT, () => {
		logger.info(`Server started on port ${PORT}`);
		console.log(`Server running on http://localhost:${PORT}`);
		console.log(`Admin Panel: http://localhost:${PORT}/admin/login`);
		console.log(`Public Display: http://localhost:${PORT}/display`);
	});
};

start().catch((err) => {
	logger.error('Failed to start server', { error: err.message });
	console.error('Failed to start server:', err);
	process.exit(1);
});

export { io };
