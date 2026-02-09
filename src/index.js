require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cron = require('node-cron');
const winston = require('winston');

// 1. Configure Logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console()
    ]
});

// 2. Initializations & Validation
const requiredEnv = ['API_KEY', 'API_SECRET', 'ACCESS_TOKEN', 'ACCESS_SECRET', 'GEMINI_API_KEY'];
for (const env of requiredEnv) {
    if (!process.env[env] || process.env[env].includes('your_')) {
        logger.error(`CRITICAL: ${env} is missing or not configured in .env file.`);
        process.exit(1);
    }
}

const client = new TwitterApi({
    appKey: process.env.API_KEY,
    appSecret: process.env.API_SECRET,
    accessToken: process.env.ACCESS_TOKEN,
    accessSecret: process.env.ACCESS_SECRET,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const rwClient = client.readWrite;

const TECH_TOPICS = [
    "Artificial Intelligence and its impact on future jobs",
    "Generative AI and Large Language Models",
    "JavaScript and TypeScript development tips",
    "Python for Automation and Data Science",
    "Cloud Computing best practices (AWS/Azure/GCP)",
    "Web3, Blockchain, and Decentralized Apps",
    "Cybersecurity tips for developers",
    "Software Engineering architecture patterns",
    "Startup culture and entrepreneurship for developers",
    "Quantum Computing and the future of processing",
    "Open Source contribution benefits",
    "The evolution of mobile app development",
    "DevOps and CI/CD pipelines",
    "Internet of Things (IoT) innovations",
    "Machine Learning in daily life"
];

async function generateTechTweet() {
    try {
        const topic = TECH_TOPICS[Math.floor(Math.random() * TECH_TOPICS.length)];
        logger.info(`Generating content for topic: ${topic}`);

        const prompt = `You are a world-class tech influencer and expert software engineer. 
        Write a short, engaging, and high-value tweet about ${topic}. 
        Include 1-2 relevant hashtags. Keep it under 240 characters. 
        Make it sound insightful, professional, and helpful. Avoid using quotes.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim().replace(/["']/g, "");
    } catch (e) {
        logger.error("AI Content Generation failed: " + e.message);
        return null;
    }
}

async function postToTwitter() {
    logger.info('Starting scheduled post cycle...');
    try {
        const tweetContent = await generateTechTweet();

        if (!tweetContent) {
            logger.warn('No content generated, skipping this cycle.');
            return;
        }

        logger.info(`Posting to X: "${tweetContent}"`);
        await rwClient.v2.tweet(tweetContent);
        logger.info('Tweet posted successfully!');

    } catch (error) {
        logger.error('Error posting to Twitter: ' + error.message);
        if (error.code === 401) {
            logger.error('Authentication Error: Check your API keys and ensure "Read and Write" permissions are enabled.');
        }
    }
}

// 3. Main Run logic
(async () => {
    try {
        // Verify connection and get account info
        const me = await rwClient.v2.me();
        logger.info(`Successfully authenticated as @${me.data.username}`);
        logger.info('MODE: Pure API - Free Tier (Posting Only)');

        // Post immediately on startup
        await postToTwitter();

        // Schedule: Every 1 hour (0 * * * *)
        cron.schedule('0 * * * *', () => {
            postToTwitter();
        });

        logger.info('Bot scheduled. It will post a new tech insight every hour. Press Ctrl+C to stop.');

    } catch (error) {
        logger.error('Failed to connect to Twitter API: ' + error.message);
        logger.error('Make sure "User authentication settings" are enabled in Developer Portal with "Read and Write" permissions.');
        process.exit(1);
    }
})();
