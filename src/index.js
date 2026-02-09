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

// 2. Initializations
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
    "JavaScript and TypeScript development tips",
    "Python for Data Science",
    "Cloud Computing (AWS/Azure) best practices",
    "Web3 and Blockchain innovation",
    "Cybersecurity tips for small businesses",
    "The future of SpaceX and space travel",
    "Startup culture and entrepreneurship advice",
    "Software engineering career growth",
    "Quantum Computing explained simply"
];

async function generateTechTweet() {
    try {
        const topic = TECH_TOPICS[Math.floor(Math.random() * TECH_TOPICS.length)];
        logger.info(`Generating content for topic: ${topic}`);

        const prompt = `You are a world-class tech influencer and software engineer. 
    Write a short, engaging, and viral-worthy tweet about ${topic}. 
    Include 1-2 relevant hashtags. Keep it under 240 characters. 
    Make it sound human, insightful, and slightly provocative or helpful.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim().replace(/["']/g, ""); // Remove quotes if AI adds them
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
    }
}

// 3. Main Entry
(async () => {
    try {
        // Verify login
        const me = await rwClient.v2.me();
        logger.info(`Logged in as @${me.data.username} (ID: ${me.data.id})`);
        logger.info('Running in FREE TIER mode (Posting only).');

        // Initial post
        await postToTwitter();

        // Schedule: Post every 2 hours (0 */2 * * *)
        cron.schedule('0 */2 * * *', () => {
            postToTwitter();
        });

        logger.info('Bot scheduled. It will post unique tech content every 2 hours. Press Ctrl+C to stop.');

    } catch (error) {
        logger.error('Authentication failed. Ensure your keys have READ/WRITE permissions: ' + error.message);
        process.exit(1);
    }
})();
