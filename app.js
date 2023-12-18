const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')
const app = express()
app.use(express.json())

let db = null
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

//API-1 register
app.post('/register/', async (request, response) => {
  const {name, username, password, gender} = request.body
  const checkQuery = `SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(checkQuery)
  if (password.length >= 6) {
    const hashedPswd = await bcrypt.hash(request.body.password, 10)
    if (dbUser === undefined) {
      const query = `
                INSERT INTO
                    user (name, username, password, gender)
                VALUES ('${name}', '${username}', '${hashedPswd}', '${gender}');`
      await db.run(query)
      response.status(200)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('User already exists')
    }
  } else {
    response.status(400)
    response.send('Password is too short')
  }
})

//API-2 login
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const checkQuery = `SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(checkQuery)
  console.log(dbUser)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPswdCrt = await bcrypt.compare(password, dbUser.password)
    if (isPswdCrt === true) {
      request.loggedInUserId = dbUser.user_id
      const payload = {username: username, loggedInUserId: request.loggedInUserId}
      const jwtToken = jwt.sign(payload, 'abcdefg')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//Authentication with JWT Token
const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'abcdefg', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.loggedInUserId = payload.loggedInUserId
        next()
      }
    })
  }
}

//API-3 Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const query = `
    SELECT
      user.username AS username,
      T1.tweet AS tweet,
      T1.date_time AS dateTime
    FROM (tweet
    INNER JOIN follower
    ON tweet.user_id = follower.following_user_id) AS T1
    INNER JOIN user
    ON T1.user_id = user.user_id
    ORDER BY T1.date_time DESC
    LIMIT 4;
    ;`
  const tweetsArr = await db.all(query)
  response.send(tweetsArr)
})

//API-4 Returns the list of all names of people whom the user follows
app.get('/user/following/', authenticateToken, async (request, response) => {
  const query = `
    SELECT
      user.username AS name
    FROM user
    INNER JOIN follower
    ON user.user_id = follower.following_user_id
    ;`
  const lst = await db.all(query)
  /*let llst = lst.filter(
    (obj, index, array) =>
      array.map(mapObj => mapObj.name).indexOf(obj.name) === index,
  )*/
  response.send(lst)
})

//API-5 Returns the list of all names of people who follows the user
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const query = `
    SELECT
      user.username AS name
    FROM user
    INNER JOIN follower
    ON user.user_id = follower.follower_user_id
    ;`
  const lst = await db.all(query)
  /*let llst = lst.filter(
    (obj, index) =>
      lst.map(mapObj => mapObj.name).indexOf(obj.name) === index,
  )*/
  response.send(lst)
})

//API-6 If the user requests a tweet other than the users he is following
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const query = `
    SELECT
      tweet.tweet AS tweet,
      COUNT(DISTINCT like.like_id) AS likes,
      COUNT(DISTINCT reply.reply_id) AS replies,
      tweet.date_time AS dateTime
    FROM tweet INNER JOIN user
    ON tweet.user_id = user.user_id
    LEFT JOIN follower
    ON tweet.user_id = follower.following_user_id AND follower.follower_user_id IS NOT NULL
    LEFT JOIN like
    ON like.tweet_id = tweet.tweet_id
    LEFT JOIN reply
    ON reply.tweet_id = tweet.tweet_id
    WHERE
      tweet.tweet_id = ${tweetId}
    GROUP BY
      tweet.tweet_id
    ;`
  const res = await db.get(query)
  if (res) {
    response.send(res)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//API-7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const query = `
    SELECT
      username
    FROM like INNER JOIN user
    ON like.user_id = user.user_id
    WHERE
      like.tweet_id = ${tweetId}
  ;`
    const lst = await db.all(query)
    if (lst.length > 0) {
      response.send(lst)
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API-8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const query = `
    SELECT
      user.username as name,
      reply.reply as reply
    FROM reply INNER JOIN user
    ON reply.user_id = user.user_id
    WHERE
      reply.tweet_id = ${tweetId}
  ;`
    const replies = await db.all(query)
    if (replies.length > 0) {
      response.send({replies})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API-9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const query = `
    SELECT
      tweet.tweet AS tweet,
      COUNT(DISTINCT like.like_id) AS likes,
      COUNT(DISTINCT reply.reply_id) AS replies,
      tweet.date_time AS dateTime
    FROM tweet INNER JOIN user
    ON tweet.user_id = user.user_id
    LEFT JOIN follower
    ON tweet.user_id = follower.following_user_id
    LEFT JOIN like
    ON like.tweet_id = tweet.tweet_id
    LEFT JOIN reply
    ON reply.tweet_id = tweet.tweet_id
    GROUP BY
      tweet.tweet_id
    ;`
  const lst = await db.all(query)
  response.send(lst)
})

//API-10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet, user_id, date_time} = request.body
  const query = `
    INSERT INTO tweet (tweet, user_id, date_time)
    VALUES ('${tweet}', ${user_id}, '${date_time}')
  ;`
  await db.run(query)
  response.send('Created a Tweet')
})

//API-11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const loggedInUserId = request.loggedInUserId
    const check = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`
    const obj = await db.get(check)
    console.log(obj.user_id)
    console.log(loggedInUserId)
    if (obj.user_id === loggedInUserId) {
      const query = `
        DELETE FROM tweet
        WHERE tweet_id = ${tweetId}
      ;`
      await db.run(query)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  }
)

module.exports = app
