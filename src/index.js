// https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=u6i4fb5ylrw2jqmpl473trq2b8nu9k&redirect_uri=https://lynnux.xyz&scope=clips:edit+bits:read+user:edit:broadcast+user:read:broadcast+chat:read+chat:edit+channel:moderate+channel:read:subscriptions+moderation:read+channel:read:redemptions+channel:read:hype_train+channel:manage:broadcast+channel:manage:polls+channel:manage:predictions+channel:read:polls+channel:read:predictions+channel:read:goals+channel:manage:raids+channel:read:vips+channel:manage:vips+channel:read:charity+moderator:read:shoutouts+moderator:manage:shoutouts+channel:read:guest_star+channel:manage:guest_star+channel:bot+channel:read:ads&state=frontend|SzZFdE1wc3M0Q1pKSHFpQTN0MkVNdz09&force_verify=true

/*
 *
 * Needed twitch auth
 * - moderation:read  - - - - - - - | Check AutoMod / Get Banned Users / Get Moderators List.
 * - channel:manage:moderators  - - | Add / Remove moderators
 * - channel:manage:polls - - - - - | Create/Remove polls
 * - channel:read:polls - - - - - - | See poll information
 * 
 */

const tmi = require('tmi.js');

const fetch = require('node-fetch');
const express = require('express');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const dbModule = require('./db.js');
const app = express();

const userActiveTimes = {};
const userAccumulatedTime = {};

let userCache = {};
let currentGame = '';
let accessToken = '';
let currentPoll = null;

require('dotenv').config();
const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_CLIENT_SECRET;
const oauth = process.env.TWITCH_OAUTH;
const refreshToken = process.env.TWITCH_REFRESH_TOKEN;

console.log('Testing dbModule:', dbModule);

app.use(bodyParser.json());
dbModule.initializeDB((err) => {
    if (err) {
        console.log('Failed to initialize the database, exiting.');
        process.exit(1);
    }
    // Start the bot or other operations here
});

// Refresh access token:
async function main() {
    try {
        accessToken = await refreshAccessToken();
//        console.log(accessToken)
    } catch (error) {
        console.error('An error occurred:', error.message);
    }
}

const twitchClient = new tmi.Client({
  options: { debug: true },
  connection: {
      secure: true,
      reconnect: true
  },
  identity: {
      username: 'LynnuxBot',
      password: `${oauth}`
  },
  channels: ['just_lynnux','liaallure']
});

async function refreshAccessToken() {
    try {
        const response = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'client_id': `${clientId}`,
                'client_secret': `${clientSecret}`,
                'refresh_token': `${refreshToken}`,
                'grant_type': 'refresh_token'
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to refresh access token: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        // console.log(data.access_token)
        return data.access_token;
    } catch (error) {
        console.error('Error refreshing access token:', error);
        throw error;
    }
}

twitchClient.connect();
main()
setInterval(main, 300000);

//
//  commands
//
twitchClient.on('message', async (channel, tags, message, self) => {
    // Broadcaster
    const broadcasterId = await getUserId(channel.slice(1));
    // Moderators
    const channelModerators = await getModerators(broadcasterId)
    try {
        const moderatorUsernames = channelModerators
            .filter(mod => mod && mod.user_login)
            .map(mod => mod.user_login.toLowerCase());
    } catch (error) {

    }

    // User
    const username = tags.username || tags['display-name'];
    const userId = await getUserId(username);
    // Mention
    const mentionedUsers = message.match(/@[a-zA-Z0-9_]+/g)

    if (self) return; // Ignore messages from the bot itself
    const isLive = await isStreamerLive(channel.slice(1)); 
    /*
    if (isLive) {
        getUser(tags.username, channel.slice(1), async (err, user) => {
            if (err) {
                console.log('ERROR fetching user data:', err);
                return;
            }
            const currentTime = Date.now();
            if (!user) {
                // New or first-time user
                try {
                    await updateUser(tags.username, channel.slice(1), currentTime, currentTime, 0);
                    console.log('New user updated successfully');
                } catch (error) {
                    console.error('ERROR updating new user:', error);
                }
            } else {
                // Check if the time since last active is less than 5 minutes
                const timeSinceLastActive = currentTime - user.lastActive;
                const shouldAccumulate = timeSinceLastActive < 5 * 60 * 1000; // less than 5 minutes
                const newAccumulatedTime = shouldAccumulate ? user.accumulatedTime + timeSinceLastActive : user.accumulatedTime;

                try {
                    await updateUser(tags.username, channel.slice(1), currentTime, currentTime, newAccumulatedTime);
                    console.log('Returning user updated successfully:', { lastActive: currentTime, accumulatedTime: newAccumulatedTime });
                } catch (error) {
                    console.error('ERROR updating returning user:', error);
                }
            }
        });
    } else {
        console.log('Stream is not live. No updates to watch time.');
    } */

    const args = message.split(' ');
    const messages = args.join();
    const command = args.shift().toLowerCase();
    const commandName = message.trim();
    const randomNumber = Math.floor(Math.random() * 101);

    if (currentPoll && currentPoll.active) {
        if (commandName === '1' || commandName === '2') {
            const selectedOption = commandName === '1' ? currentPoll.option1 : currentPoll.option2;
            
            // Check if the user has already voted
            if (!currentPoll.option1.voters.has(tags.username) && !currentPoll.option2.voters.has(tags.username)) {
                selectedOption.votes++;
                selectedOption.voters.add(tags.username);
            }
        }
    }
    
    switch (command) {
        case '!opencomms':
            if (channel === '#liaallure') {
                const targetUsername2 = tags.username || tags['display-name'];
                if (tags.mod || tags['user-id'] === tags['room-id']) {
                    const targetUsername2 = tags.username || tags['display-name'];
                    fetch('https://api.lynnux.xyz/update-status', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ status: 'open' })
                    })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Network response was not ok');
                        }
                          // Handle successful response here
                    })
                    .catch(error => {
                        console.error('Error updating status:', error);
                    });
                    twitchClient.say(channel, `@${targetUsername2}, Comms on https://liaallure.art are set to open.`);
                } else {
                    twitchClient.say(channel, `@${targetUsername2}, Only channel broadcasters and mods can use this command!`);
                }    
            } else if (channel === '#just_lynnux') {
                console.log("!comms cant be used in lynnux")
            } else {
                console.log("!comms cant be used in here")
            }
        break;

        case '!closecomms':
            if (channel === '#liaallure') {
                const targetUsername3 = tags.username || tags['display-name'];
                if (tags.mod || tags['user-id'] === tags['room-id']) {
                    const targetUsername3 = tags.username || tags['display-name'];
                    fetch('https://api.lynnux.xyz/update-status', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ status: 'closed' })
                    })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Network response was not ok');
                        }
                    })
                    .catch(error => {
                        console.error('Error updating status:', error);
                    });
                    twitchClient.say(channel, `@${targetUsername3}, Comms on https://liaallure.art are set to closed.`);
                } else {
                    twitchClient.say(channel, `@${targetUsername3}, Only channel mods and broadcasters can use this command!`);
                }    
            } else if (channel === '#just_lynnux') {
                console.log("!comms cant be used in lynnux")
            } else {
                console.log("!comms cant be used in here")
            }
        break;

        case '!comms':
            if (channel === '#liaallure') {
                twitchClient.say(channel, `@${username}, You can order commissions at https://liaallure.art/ !`);
            } else if (channel === '#just_lynnux') {
                twitchClient.say(channel, 'Commission details are not available.');
            } else {
                twitchClient.say(channel, 'Commission details are not available.');
            }
        break;

        case '!backseat':
        case '!backseatgamer':
            if (channel === '#just_lynnux') {
                if (tags.mod || tags['user-id'] === tags['room-id']) {
                    twitchClient.say(channel, `Hey @${tags.username}, I see you're itching to grab the controller, but let's give the streamer some breathing room, shall we?`);
                } else {
                    twitchClient.say(channel, `@${tags.username}, I love your enthusiasm, but remember, backseat gaming is like putting pineapple on pizza - some people love it, but let's respect the chef's recipe!`);
                }
            } else {
                twitchClient.say(channel, `@${tags.username}, I love your enthusiasm, but remember, backseating is like putting pineapple on pizza - some people love it, but let's respect the chef's recipe!`);
            }

            break;

        case '!eval':
            if ( tags.username === 'just_lynnux' ) {
                const evalCommand = commandName.slice(6);
                const result = eval(evalCommand);
                twitchClient.say(channel, `result: ${result}`);
                console.log(result);
            }
            break;

        case '!furry':    
            if (mentionedUsers && mentionedUsers.length > 0) {
                const firstMentionedUser = mentionedUsers[0].slice(1)
                twitchClient.say(channel, `@${firstMentionedUser} is ${randomNumber}% a furry.`);
            } else {
                twitchClient.say(channel, `@${username} is ${randomNumber}% a furry.`);
            }

        break;
    
        case '!patreon':
            if (channel === '#liaallure') {
                twitchClient.say(channel, 'Support me on Patreon: https://www.patreon.com/allurepotato');
            } else if (channel === '#just_lynnux') {
                twitchClient.say(channel, 'Patreon details are not available.');
            } else {
                twitchClient.say(channel, 'Patreon details are not available.');
            }
        break;

        case '!so':
            const parts2 = message.split(' ');
            let targetUsername2 = parts2.length > 1 && parts2[1].startsWith('@') ? parts2[1].slice(1) : tags.username;

            if (channel === '#liaallure') {
                if (tags.mod || tags['user-id'] === tags['room-id']) {
                    twitchClient.say(channel, `We all love you ${targetUsername2} liapotLove`);
                } else {
                    console.log("!so failed cause no perms")
                }
            } else if (channel === '#just_lynnux') {
                if (tags.mod || tags['user-id'] === tags['room-id']) {
                    twitchClient.say(channel, `We all love you ${targetUsername2} justly8Echad !`);
                } else {
                    console.log("!so failed cause no perms")
                }
            } else {
                if (tags.mod || tags['user-id'] === tags['room-id']) {
                    twitchClient.say(channel, `We all love you ${targetUsername2}!`);
                } else {
                    console.log("!so failed cause no perms")
                }
            }
        break;        
            
        case '!test':
            const test = await getUserInfo('title', broadcasterId);
            twitchClient.say(channel, `${test}`);
            break;
        
        case '!drops':
            const currentGameID = await getCurrentGame(broadcasterId);
            const currentGame = await getGameName(currentGameID);

            const currentDrop = await getGameDrop(currentGameID);

            if (currentGame) {
                twitchClient.say(channel, `Current Game is ${currentGame}`)
            } else {
                twitchClient.say(channel, `Error.`)
            }

            break;

        case '!watchtime':
            /*
            const retryFetch = (username, channel, attempts = 0) => {
                getUser(username, channel, (err, user) => {
                    if (err || !user) {
                        if (attempts < 3) {
                            setTimeout(() => retryFetch(username, channel, attempts + 1), 100 * Math.pow(2, attempts)); // Exponential back-off
                        } else {
                            twitchClient.say(channel, `${username}, could not retrieve your watch time.`);
                        }
                    } else {
                        const watchTime = getFormattedWatchTime(user.accumulatedTime);
                        twitchClient.say(channel, `${username}, watch time: ${watchTime}`);
                    }
                });
            };
            retryFetch(tags.username, channel); */
            twitchClient.say(channel, `@${tags.username} The !watchtime is currently being updated, try again later.`)
            break;

        case '!addmod':
        case '!addmoderator':
            if (channel === '#just_lynnux') {
                if (userId === tags['room-id']) {
                    const newModeratorId = await getUserId(mentionedUsers[0].slice(1));
                    const success = await addChannelModerator(broadcasterId, newModeratorId);
                    if (success) {
                        twitchClient.say(channel, `Successfully added ${mentionedUsers[0]} as a channel moderator.`)
                    } else {
                        twitchClient.say(channel, `Failed to add ${mentionedUsers[0]} as a channel Moderator.`)
                    }
                }
            } 
            break;

        case '!removemod':
        case '!removemoderator':
            if (channel === '#just_lynnux') {
                if (userId === tags['room-id']) {
                    const oldModeratorId = await getUserId(mentionedUsers[0].slice(1));
                    const success = await removeChannelModerator(broadcasterId, oldModeratorId);
                    if (success) {
                        twitchClient.say(channel, `Successfully removed ${mentionedUsers[0]} as a channel moderator.`)
                    } else {
                        twitchClient.say(channel, `Failed to remove ${mentionedUsers[0]} as a channel Moderator.`)
                    }
                }
            }
            break;
        
        case '!poll':
        case '!chatpoll':
            // !chatpoll 1 - 2
            if (tags.mod || tags['user-id'] === tags['room-id']) {
                const pollOptions = message.slice(6).split(' - ');
                if (pollOptions.length === 2) {
                    currentPoll = {
                        option1: { option: pollOptions[0], votes: 0, voters: new Set() },
                        option2: { option: pollOptions[1], votes: 0, voters: new Set() },
                        active: true
                    };
                    twitchClient.say(channel, `New poll started! Type 1 for "${currentPoll.option1.option}" or 2 for "${currentPoll.option2.option}"`);
                } else {
                    twitchClient.say(channel, "Wrong usage please use !poll <option1> - <option2>.")
                }
            }
            break;

        case '!endpoll':
        case '!results':
            if (tags.mod || tags['user-id'] === tags['room-id']) {

                if (currentPoll && currentPoll.active) {
                    twitchClient.say(channel, `Poll results: "${currentPoll.option1.option}": ${currentPoll.option1.votes}, "${currentPoll.option2.option}": ${currentPoll.option2.votes}`)
                    currentPoll.active = false;    
                } else {
                    twitchClient.say(channel, "There is no poll running at this time.")
                }
            }
            break;
    }
});  

// Get User info
async function getUserInfo(tag, userId) {
    /**
     * adult  - - - | is 18+ stream
     * tags - - - - | User Tags
     * language - - | streamlanguage
     * thumbnail  - | Stream Tumbnail
     * started  - - | Stream Started Time
     * viewers  - - | Stream viewers
     * title  - - - | Stream Title
     * gamename - - | Name of Game being streamed
     * gameid - - - | Id of game being streamed
     * status - - - | stream type
     **/
    const url = `https://api.twitch.tv/helix/streams?user_id=${userId}`
    const headers = {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
    };
    try {
        const responce = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        if (!responce.ok) {
            const errorData = await responce.json();
            console.log(`failed get userinfo of ${userId}:`, errorData);
            return false;
        } 

        const data = await responce.json();

        if (data.data && data.data.length > 0) {
            const userInfo = data.data[0];
            if (tag === 'adult') {
                const isAdult = userInfo.is_mature;
                return isAdult;
            } else if (tag === 'tags') {
                const userTags = userInfo.tags;
                return userTags;
            } else if (tag === 'language') {
                const language = userInfo.language;
                return language
            } else if (tag === 'thumbnail') {
                const thumbnail = userInfo.thumbnail_url;
                return thumbnail;
            } else if (tag === 'started') {
                const startDate = userInfo.started_at;
                return startDate;
            } else if (tag === 'viewers') {
                const viewers = userInfo.viewer_count;
                return viewers;
            } else if (tag === 'title') {
                const title = userInfo.title;
                return title;
            } else if (tag === 'gamename') {
                const gameName = userInfo.game_name;
                return gameName;
            } else if (tag === 'gameid') {
                const gameId = userInfo.game_id;
                return gameId;
            } else if (tag === 'status') {
                const status = userInfo.type;
                return status;
            }
            // return userInfo;
        } else {
            console.log(`User is not live. ${userId}`)
            return false;
        }
    } catch (error) {
        console.log('ERROR', error)
        return false;
    }
}

// isStreamerLive
async function isStreamerLive(username) {
    const response = await fetch(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
        headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${accessToken}`
        }
    });
    const data = await response.json();
    return data.data.length > 0;
}

// Get Current Game ID
async function getCurrentGame(broadcasterId){
    const url = `https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`
    const headers = {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
    };
    try {
        const responce = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        if (!responce.ok) {
            const errorData = await responce.json();
            console.log(`failed get the game current game:`, errorData);
            return false;
        } 

        const data = await responce.json();
        if (data.data && data.data.length > 0) {
            const currentGameID = data.data[0].game_id;
            console.log(`The current gameID is ${currentGameID}`)
            return currentGameID;
        } else {
            console.log(`No data found`)
            return false;
        }
    } catch (error) {
            console.log('ERROR', error)
            return false;
        }
}

// Get gameID from Name
async function getGameId(gameName) {
    const url = `https://api.twitch.tv/helix/games?name=${encodeURIComponent(gameName)}`
    const headers = {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
    };
    try {
        const responce = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        if (!responce.ok) {
            const errorData = await responce.json();
            console.log(`failed get the game ${gameName}:`, errorData);
            return false;
        } 

        const data = await responce.json();
        if (data.data && data.data.length > 0) {
            const gameID = data.data[0].id;
            console.log(`The id of ${gameName} is ${gameID}`)
            return gameID;
        } else {
            console.log(`No game found for ${gameName}`)
            return false;
        }
    } catch (error) {
        console.log('ERROR', error)
        return false;
    }
}

// Game ID to GameName
async function getGameName(gameId) {
    const url = `https://api.twitch.tv/helix/games?id=${gameId}`
    const headers = {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
    };
    try {
        const responce = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        if (!responce.ok) {
            const errorData = await responce.json();
            console.log(`failed get the name of ${gameId}:`, errorData);
            return false;
        } 

        const data = await responce.json();
        if (data.data && data.data.length > 0) {
            const gameName = data.data[0].name;
            console.log(`The id of ${gameId} is ${gameName}`)
            return gameName;
        } else {
            console.log(`No game found for ${gameId}`)
            return false;
        }
    } catch (error) {
        console.log('ERROR', error)
        return false;
    }
}

// get Game Drops
async function getGameDrop(gameId) {
    const url = `https://api.twitch.tv/helix/games?id=${gameId}`
    const headers = {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
    };
    try {
        const responce = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        if (!responce.ok) {
            const errorData = await responce.json();
            console.log(`failed get drops of ${gameId}:`, errorData);
            return false;
        } 

        const data = await responce.json();
        console.log(data);

        if (data.data && data.data.length > 0) {
            const gameDrops = data.data[0].drops;
            console.log(`The id of ${gameId} is ${gameDrops}`)
            return gameDrops;
        } else {
            console.log(`No game found for ${gameId}`)
            return false;
        }
    } catch (error) {
        console.log('ERROR', error)
        return false;
    }
}

// WatchTime
function getFormattedWatchTime(milliseconds) {
    if (milliseconds <= 0) {
        return 'No watch time available';
    }
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    return `${hours} hours, ${minutes} minutes, ${seconds} seconds`;
}

// GetUserID
async function getUserId(channelName) {
    const response = await fetch(`https://api.twitch.tv/helix/users?login=${channelName}`, {
        method: 'GET',
        headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    const data = await response.json();
    if (data.data.length === 0) throw new Error('User not found');
    return data.data[0].id;
}

// Get Channel Moderators
async function getModerators(broadcasterId) {
    const response = await fetch(`https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${broadcasterId}`, {
        headers: {
            'Client-ID': `${clientId}`,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    const data = await response.json();
    return data.data;
}

// Add a channel moderator
async function addChannelModerator(broadcasterId, newModeratorId) {
    const url = `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${broadcasterId}&user_id=${newModeratorId}`
    const headers = {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
        'content': 'application/json'
    };

    try {
        const responce = await fetch(url, {
            method: 'POST',
            headers: headers
        });
        if (!responce.ok) {
            const errorData = await responce.json();
            console.log('failed to add moderator:', errorData);
            return false;
        }

        return true;
    } catch (error) {
        console.log('ERROR adding Moderator', error)
        return false;
    }
}

// Remove a channel moderator
async function removeChannelModerator(broadcasterId, oldModeratorId) {
    const url = `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${broadcasterId}&user_id=${oldModeratorId}`
    const headers = {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
    };

    try {
        const responce = await fetch(url, {
            method: 'DELETE',
            headers: headers
        });
        if (!responce.ok) {
            const errorData = await responce.json();
            console.log('failed to remove moderator:', errorData);
            return false;
        }

        return true;
    } catch (error) {
        console.log('ERROR removing Moderator', error)
        return false;
    }
}

// Update user cache
function updateUserCache(username, channel, lastActive, accumulatedTime) {
    const key = `${username}-${channel}`;
    userCache[key] = { lastActive, accumulatedTime };
}

// get user cache
function getUserFromCache(username, channel) {
    const key = `${username}-${channel}`;
    return userCache[key] || null;
}

/**
 * DATABASE
 */

// Update userinfo
function updateUser(username, channel, currentTime, lastActive, accumulatedTime) {
    return new Promise((resolve, reject) => {
        console.log(`1 - Attempting to update user data at ${new Date().toISOString()}`);
        const sql = `
            INSERT INTO user_watchtime (username, channel, lastActive, accumulatedTime)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(username, channel) DO UPDATE SET
                lastActive = excluded.lastActive,
                accumulatedTime = excluded.accumulatedTime;
        `;
        dbModule.run(sql, [username, channel, currentTime, accumulatedTime], (err) => {
            if (err) {
                console.error(`Error updating user watch time:`, err.message);
                reject(err);
            } else {
                console.log(`User data updated or inserted for ${username}`);
                resolve();
            }
        });
        console.log(`2 - Attempting to update user data at ${new Date().toISOString()}`);

    });
}


// Get userinfo
function getUser(username, channel, callback, attempts = 0) {
    console.log(`3 - Attempting to update user data at ${new Date().toISOString()}`);
    const sql = `SELECT lastActive, accumulatedTime FROM user_watchtime WHERE username = ? AND channel = ?`;
    dbModule.get(sql, [username, channel], (err, row) => {
        if (err) {
            console.error(`Error retrieving user watch time:`, err.message);
            callback(err, null);
        } else if (!row && attempts < 3) {
            setTimeout(() => {
                getUser(username, channel, callback, attempts + 1);  // Retry after a delay
            }, 100 * Math.pow(2, attempts));  // Exponential backoff
        } else if (!row) {
            console.error(`Data not found for ${username} after multiple attempts.`);
            callback(new Error("Data not found"), null);
        } else {
            console.log(`Retrieved user data for ${username}:`, row);
            callback(null, row);
        }
    });
    console.log(`4 - Attempting to update user data at ${new Date().toISOString()}`);

}

// Close database connection before shutting down
function handleShutdown() {
    console.log('Shutting down gracefully...');
    closeDb();
    process.exit();
}

// Start the server
app.listen(50, () => {
    console.log('info: WebServer is running on port 50');
});

// handle shutdown
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);