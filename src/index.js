require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const puppeteer = require('puppeteer');
const cron = require('node-cron');
const winston = require('winston');
const fs = require('fs');

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
const requiredEnv = ['API_KEY', 'API_SECRET', 'ACCESS_TOKEN', 'ACCESS_SECRET', 'GEMINI_API_KEY', 'TWITTER_USERNAME', 'TWITTER_PASSWORD'];
for (const env of requiredEnv) {
    if (!process.env[env]) {
        logger.error(`CRITICAL: ${env} is missing from .env file.`);
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

const COOKIES_PATH = 'cookies.json';
const CONFIG = {
    keywords: (process.env.TARGET_KEYWORDS || 'tech').split(',').map(k => k.trim()),
    accounts: (process.env.TARGET_ACCOUNTS || '').split(',').map(a => a.trim()).filter(a => a),
    likeLimit: 10,
    replyProb: 0.2, // 20% chance to reply to a tweet we find
};

class HybridBot {
    constructor() {
        this.browser = null;
        this.page = null;
        this.userId = null;
    }

    async initBrowser() {
        logger.info('Launching browser...');
        this.browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.page = await this.browser.newPage();
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

        if (fs.existsSync(COOKIES_PATH)) {
            const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH));
            await this.page.setCookie(...cookies);
            logger.info('Loaded cookies.');
        }
    }

    async login() {
        try {
            await this.page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
            if (this.page.url().includes('/home')) {
                logger.info('Already logged into X.');
                return;
            }

            logger.info('Performing fresh login...');
            await this.page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle2' });

            await this.page.waitForSelector('input[autocomplete="username"]', { timeout: 30000 });
            await this.page.type('input[autocomplete="username"]', process.env.TWITTER_USERNAME, { delay: 100 });
            await this.page.keyboard.press('Enter');

            const passwordField = await this.page.waitForSelector('input[name="password"]', { timeout: 15000 }).catch(() => null);

            if (!passwordField) {
                logger.info('Extra verification step detected (Email/Phone)...');
                const verifyInput = await this.page.waitForSelector('input[data-testid="ocfEnterTextTextInput"]', { timeout: 10000 }).catch(() => null);
                if (verifyInput) {
                    await verifyInput.type(process.env.TWITTER_EMAIL, { delay: 100 });
                    await this.page.keyboard.press('Enter');
                    await this.page.waitForSelector('input[name="password"]', { timeout: 15000 });
                }
            }

            await this.page.type('input[name="password"]', process.env.TWITTER_PASSWORD, { delay: 100 });
            await this.page.keyboard.press('Enter');

            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

            if (this.page.url().includes('/home')) {
                const cookies = await this.page.cookies();
                fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies));
                logger.info('Login successful and cookies saved.');
            } else {
                throw new Error('Login failed: Redirected to ' + this.page.url());
            }
        } catch (error) {
            await this.page.screenshot({ path: 'login_error.png' });
            logger.error(`Login failed. Screenshot saved to login_error.png. Error: ${error.message}`);
            throw error;
        }
    }

    async getTweetIdsFromSearch(keyword) {
        logger.info(`Searching for keyword: ${keyword}`);
        const url = `https://twitter.com/search?q=${encodeURIComponent(keyword)}&f=live`;
        await this.page.goto(url, { waitUntil: 'networkidle2' });
        await this.page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 }).catch(() => null);

        const ids = await this.page.evaluate(() => {
            const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
            return tweets.map(t => {
                const link = t.querySelector('a[href*="/status/"]');
                if (link) {
                    const parts = link.href.split('/');
                    return { id: parts[parts.length - 1], text: t.innerText };
                }
                return null;
            }).filter(t => t);
        });
        return ids;
    }

    async runCycle() {
        logger.info('--- Starting Hybrid Interaction Cycle ---');
        try {
            // Pick a random keyword to keep it fresh
            const kw = CONFIG.keywords[Math.floor(Math.random() * CONFIG.keywords.length)];
            const tweetsFound = await this.getTweetIdsFromSearch(kw);

            logger.info(`Found ${tweetsFound.length} potential tweets.`);
            let count = 0;

            for (const tweetObj of tweetsFound) {
                if (count >= CONFIG.likeLimit) break;

                try {
                    // Perform actions via API (Fast and Safe)
                    await rwClient.v2.like(this.userId, tweetObj.id);
                    logger.info(`API: Liked tweet ${tweetObj.id}`);

                    if (Math.random() < CONFIG.replyProb) {
                        const reply = await this.generateReply(tweetObj.text);
                        await rwClient.v2.reply(reply, tweetObj.id);
                        logger.info(`API: Replied to ${tweetObj.id}`);
                    }

                    count++;
                    await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));
                } catch (e) {
                    if (e.code === 403) logger.warn("Already interacted or limit reached.");
                    else logger.error("API Action failed: " + e.message);
                }
            }

            // Also post a unique update
            const status = await this.generateTechUpdate();
            await rwClient.v2.tweet(status);
            logger.info(`API: Posted unique status: ${status}`);

        } catch (e) {
            logger.error('Hybrid cycle error: ' + e.message);
        }
    }

    async generateReply(text) {
        const prompt = `Write a short, professional, and engaging 1-sentence reply to this tech tweet. Do not use hashtags. Text: "${text}"`;
        const result = await model.generateContent(prompt);
        return (await result.response).text().trim().replace(/["']/g, "");
    }

    async generateTechUpdate() {
        const prompt = `Write a viral, insightful tech tweet (under 240 chars) about current trends in AI or Software Engineering. Use 1 hashtag.`;
        const result = await model.generateContent(prompt);
        return (await result.response).text().trim().replace(/["']/g, "");
    }
}

// 3. Execution
(async () => {
    const bot = new HybridBot();
    try {
        // 1. Get User ID via API
        const me = await rwClient.v2.me();
        bot.userId = me.data.id;
        logger.info(`API linked to @${me.data.username}`);

        // 2. Prepare Browser
        await bot.initBrowser();
        await bot.login();

        // 3. Run Initial
        await bot.runCycle();

        // 4. Schedule
        cron.schedule('0 * * * *', async () => {
            await bot.runCycle();
        });

        logger.info('Hybrid bot is running. Browsing via Puppeteer, Acting via API. Schedule: Every 1 hour.');

    } catch (e) {
        logger.error('Startup failed: ' + e.message);
        process.exit(1);
    }
})();
