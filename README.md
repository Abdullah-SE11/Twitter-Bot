# Twitter Automation Bot

This bot automates Twitter/X interactions using browser automation (Puppeteer).
It can automatically:
- Log in
- Search for tweets by keywords/hashtags
- Like relevant tweets
- Retweet/Repost
- Post original tweets (from a configured list)

## ⚠️ Important Warning
Automating user actions on Twitter/X using browser automation is against their Terms of Service and can result in **account suspension**. Use this tool at your own risk and with extremely conservative settings (low frequency).

## Prerequisites
- Node.js installed
- A [Twitter Developer Account](https://developer.twitter.com/en/apply-for-access) with **Essential** or **Elevated** access.
- An App created in the Developer Portal with **Read and Write** and **Direct Message** permissions (or just Read/Write).

## Setup

1.  Clone/Download this repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file based on `.env.example`:
    ```bash
    cp .env.example .env
    ```
4.  **Crucial Step**: Fill in your API Key, API Secret, Access Token, and Access Secret from the Twitter Developer Portal.
    - Ensure your App Settings -> User Authentication Settings have "Read and Write" enabled.
    - Regenerate your Access Token/Secret *after* enabling Read and Write if you haven't already.

## Features
- **Official API**: Uses Twitter Developer API for safe interaction.
- **Scheduled Interactions**: Runs interactions every hour and posts every 6 hours.
- **Targeted Engagement**: Interacts with tweets containing specific keywords.

## Usage

Run the bot:
```bash
npm start
```

## Configuration (.env)

| Variable | Description |
|----------|-------------|
| `TWITTER_USERNAME` | Your Twitter handle (without @) |
| `TWITTER_PASSWORD` | Your Twitter password |
| `TWITTER_EMAIL` | Backup email for verification |
| `TARGET_KEYWORDS` | Comma-separated list of keywords/hashtags to engage with |
| `POST_INTERVAL_MIN` | Minimum minutes between posts |
| `LIKE_LIMIT_PER_RUN` | Max likes per session |
| `HEADLESS` | Set to `false` to see the browser running (recommended for first run) |
