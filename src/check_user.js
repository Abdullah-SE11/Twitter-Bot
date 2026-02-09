require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

const client = new TwitterApi({
    appKey: process.env.API_KEY,
    appSecret: process.env.API_SECRET,
    accessToken: process.env.ACCESS_TOKEN,
    accessSecret: process.env.ACCESS_SECRET,
});

(async () => {
    try {
        const me = await client.v2.me();
        console.log(`CURRENT_USER: @${me.data.username}`);
    } catch (e) {
        console.error('Error identifying user: ' + e.message);
    }
})();
