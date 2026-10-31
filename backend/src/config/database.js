import mongoose from 'mongoose';
import config from './env.js';
import logger from './logger.js';

// Operator injection ({ $gt: '' }) is stopped earlier by the sanitize middleware + Joi schemas.
mongoose.set('strictQuery', true);

export async function connectDatabase(uri = config.mongo.uri) {
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB error'));

  await mongoose.connect(uri, {
    dbName: config.mongo.dbName,
    maxPoolSize: config.mongo.maxPool,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    autoIndex: config.mongo.autoIndex,
    retryWrites: true,
  });
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.connection.close(false);
}

export default mongoose;
