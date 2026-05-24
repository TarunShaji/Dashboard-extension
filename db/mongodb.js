import { MongoClient } from 'mongodb'
import fs from 'fs'
import path from 'path'

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'agency_dashboard'
const MONGO_CA_PATH = process.env.MONGO_CA_PATH // Path to the AWS RDS certificate .pem file

/** @type {MongoClient} */
let cachedClient = global.mongoClient || null
/** @type {import('mongodb').Db} */
let cachedDb = global.mongoDb || null

/**
 * Robust MongoDB connection singleton.
 * Uses global caching to survive HMR in development and reuse connections in production.
 */
export async function connectToMongo() {
    // 1. Return cached if available
    if (cachedClient && cachedDb) {
        return cachedDb
    }

    if (!MONGO_URL) {
        throw new Error('Please define the MONGO_URL environment variable inside .env')
    }

    try {
        console.debug('[mongodb] 🔌 Connecting to MongoDB...')

        const opts = {
            maxPoolSize: 10,
            minPoolSize: 2,
            serverSelectionTimeoutMS: 8000,
            connectTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            // Modern drivers handle SSL/TLS automatically, but we can ensure stability
            retryWrites: MONGO_URL.includes('mongodb+srv') ? true : false, // DocumentDB doesn't support retryWrites=true usually
        }

        // Add CA certificate if provided (Required for AWS DocumentDB)
        if (MONGO_CA_PATH) {
            try {
                const caPath = path.isAbsolute(MONGO_CA_PATH)
                    ? MONGO_CA_PATH
                    : path.join(process.cwd(), MONGO_CA_PATH)

                if (fs.existsSync(caPath)) {
                    opts.tlsCAFile = caPath
                    opts.tls = true
                    console.debug('[mongodb] 🔒 SSL/TLS Certificate loaded from:', caPath)
                } else {
                    console.warn(`[mongodb] ⚠️ MONGO_CA_PATH provided but file not found at: ${caPath}`)
                }
            } catch (certErr) {
                console.error('[mongodb] ❌ Error loading SSL certificate:', certErr.message)
            }
        }

        const client = new MongoClient(MONGO_URL, opts)
        await client.connect()

        const db = client.db(DB_NAME)

        // Cache globally to survive Hot Module Replacement (HMR) during dev
        if (process.env.NODE_ENV === 'development') {
            global.mongoClient = client
            global.mongoDb = db
        }

        cachedClient = client
        cachedDb = db

        console.log('[mongodb] ✅ MongoDB Connected')
        return cachedDb
    } catch (err) {
        console.error('[mongodb] ❌ Connection failed:', err.message)
        // Ensure we don't return a broken state
        cachedClient = null
        cachedDb = null
        throw err
    }
}
