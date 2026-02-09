require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
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

// 2. Client Initialization
// We need read/write access. Ensure your App permissions allow this in Developer Portal!
const client = new TwitterApi({
    appKey: process.env.API_KEY,
    appSecret: process.env.API_SECRET,
    accessToken: process.env.ACCESS_TOKEN,
    accessSecret: process.env.ACCESS_SECRET,
});

// Use the read-write client for actions
const rwClient = client.readWrite;

// Configuration
const CONFIG = {
    keywords: (process.env.TARGET_KEYWORDS || 'tech,coding').split(','),
    likeLimit: parseInt(process.env.LIKE_LIMIT_PER_RUN || 5, 10),
    retweetProb: parseFloat(process.env.RETWEET_PROBABILITY || 0.2), // 20% chance
};

async function checkExampleCredentials() {
    if (!process.env.API_KEY || process.env.API_KEY === 'your_api_key') {
        logger.error('CRITICAL: You are using default/empty credentials. Please edit your .env file with real Twitter API keys.');
        process.exit(1);
    }
}

async function runInteractions() {
    logger.info('Starting interaction cycle...');
    try {
        // 1. Search for recent tweets
        // Note: Standard API v2 search (recent) has limitations.
        const query = CONFIG.keywords.join(' OR ') + ' -is:retweet -is:reply lang:en';
        logger.info(`Searching for: ${query}`);

        const searchResult = await rwClient.v2.search(query, {
            'tweet.fields': ['created_at', 'author_id'],
            max_results: 10,
        });

        const tweets = searchResult.tweets;
        if (!tweets || tweets.length === 0) {
            logger.info('No tweets found for keywords.');
            return;
        }

        logger.info(`Found ${tweets.length} tweets.`);

        let actionsTaken = 0;

        for (const tweet of tweets) {
            if (actionsTaken >= CONFIG.likeLimit) break;

            try {
                // Like the tweet
                logger.info(`Liking tweet ${tweet.id}...`);
                await rwClient.v2.like(process.env.USER_ID, tweet.id); // Note: We need the authenticated user's ID
                actionsTaken++;
                logger.info(`Liked tweet ${tweet.id}`);

                // Chance to Retweet
                if (Math.random() < CONFIG.retweetProb) {
                    logger.info(`Retweeting tweet ${tweet.id}...`);
                    await rwClient.v2.retweet(process.env.USER_ID, tweet.id);
                    logger.info(`Retweeted tweet ${tweet.id}`);
                }

                // Wait to avoid rate limits
                await new Promise(r => setTimeout(r, 2000));

            } catch (e) {
                logger.error(`Failed to interact with tweet ${tweet.id}: ${e.message}`);
            }
        }

        logger.info(`Cycle complete. Actions taken: ${actionsTaken}`);

    } catch (error) {
        logger.error('Error in interaction cycle: ' + error.message);
    }
}

async function postScheduledTweet() {
    try {
        const text = `Hello World! This is an automated post at ${new Date().toISOString()}. #bot #test`;
        logger.info(`Posting tweet: "${text}"`);

        await rwClient.v2.tweet(text);

        logger.info('Tweet posted successfully via API.');
    } catch (e) {
        logger.error('Failed to post tweet: ' + e.message);
    }
}

// 3. Main Entry
(async () => {
    await checkExampleCredentials();

    try {
        // Determine the authenticated user's ID first (needed for Like/Retweet)
        const me = await rwClient.v2.me();
        process.env.USER_ID = me.data.id;
        logger.info(`Logged in as @${me.data.username} (ID: ${me.data.id})`);

        // Initial run
        await runInteractions();

        // Schedule: Interactions every hour
        cron.schedule('0 * * * *', () => {
            runInteractions();
        });

        // Schedule: Post every 6 hours
        cron.schedule('0 */6 * * *', () => {
            postScheduledTweet();
        });

        logger.info('Bot scheduled and running. Press Ctrl+C to stop.');

    } catch (error) {
        logger.error('Authentication failed. Check your API keys: ' + error.message);
        process.exit(1);
    }
})();
