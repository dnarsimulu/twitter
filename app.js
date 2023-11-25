const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const dbPath = path.join(__dirname, 'twitterClone.db')
const app = express()
app.use(express.json())
let db = null

const initializeDbAndServer = async () => {
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
initializeDbAndServer()

const getFollowingPeopleIdsOfUser = async () => {
  const getTheFollowingPeopleQuery = `
    select 
    following_user_id from follower
    inner join user on user.user_id=follower.follower_user_id
    where user.username='${username}';`
  const followingPeople = await db.all(getTheFollowingPeopleQuery)
  const arrayOfIds = followingPeople.map(eachUser => eachUser.following_user_id)
  return arrayOfIds
}

//AUTHENTICATION TOKEN
const authentication = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken) {
    jwt.verify(jwtToken, 'SECRET_KEY', (error, payload) => {
      if (error) {
        response.status(400)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  } else {
    response.status(400)
    response.send('Invalid JWT Token')
  }
}

//TWEET ACCESS VERIFICATION
const tweetAccessVerification = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetQuery = `select * from tweet 
                       inner join follower on tweet.user_id=follower.following_user_id 
                       where 
                       tweet.tweet_id='${tweetId}' and follower_user_id='${userId}';`
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(400)
    response.send('Invalid Request')
  } else {
    next()
  }
}

//API 1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUserQuery = `select * from user where username='${username}'`
  const userDBDetails = await db.get(getUserQuery)
  if (userDBDetails !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUserQuery = `insert into user (username, password, name, gender)
            values ('${username}', '${hashedPassword}', '${name}', '${gender}')`
      await db.run(createUserQuery)
      response.send('User created successfully')
    }
  }
})

//API 2

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `select * from user where username='${username}';`
  const userDbDetails = await db.get(getUserQuery)
  if (userDbDetails !== undefined) {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      userDbDetails.password,
    )
    if (isPasswordCorrect) {
      const payload = {username, userId: userDbDetails.user_id}
      const jwtToken = jwt.sign(payload, 'SECRET_KEY')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

//API 3
app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {username} = request
  const followingPeopleId = await getFollowingPeopleIdsOfUser(username)
  const getTweetsQuery = `select 
    username, tweet, date_time as dateTime
    from user inner join on user.user_id=tweet.user_id
    where 
    user.user_id in (${followingPeopleId})
    order by date_time desc 
    limit 4;`
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

//API 4
app.get('/user/following/', authentication, async (request, response) => {
  const {username, userId} = request
  const getFollowingUsersQuery = `select name from follower
    inner join on user.user_id=follower.following_user_id
    where 
    follower_user_id='${userId}';`
  const followingPeople = await db.all(getFollowingUsersQuery)
  response.send(followingPeople)
})

//API 5
app.get('/user/followers/', authentication, async (request, response) => {
  const {username, userId} = request
  const getFollowersQuery = `select distinct name from follower
    inner join user on user.user_id=follower.follower_user_id
    where following_user_id='${userId}';`
  const followers = await db.all(getFollowersQuery)
  response.send(followers)
})

//API 6
app.get(
  '/tweets/:tweetId/',
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const getTweetQuery = `select tweet,
    (select count() from like where tweet_id='${tweetId}') as likes,
    (select count() from reply where tweet_id='${tweetId}') as replies,
    date_time as dateTime
    from tweet 
    where tweet.tweet_id='${tweetId}';`
    const tweet = await db.get(getTweetQuery)
    response.send(tweet)
  },
)

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getLikesQuery = `select username 
    from user inner join like on user.user_id=like.user_id
    where tweet_id='${tweetId}';`
    const likedUsers = await db.all(getLikesQuery)
    const usersArray = likedUsers.map(eachUser => eachUser.username)
    response.send({likes: usersArray})
  },
)

//API 8
app.get(
  '/tweets/:tweetId/replies/',
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = requset.params
    const getRepliedQuery = `select name, reply 
    from user inner join reply on user.user_id=reply.user_id
    where tweet_id='${tweetId}';`
    const repliedUsers = await db.all(getRepliedQuery)
    response.send({replies: repliedUsers})
  },
)

//API 9
app.get('/user/tweets/', authentication, async (request, response) => {
  const {userId} = request
  const getTweetsQuery = `select tweet,
    count(distinct like_id) as likes,
    count(distinct reply_id as replies),
    date_time as dateTime 
    from tweet left join reply on tweet.tweet_id=reply.tweet_id left join like on tweet.tweet_id=like.tweet_id 
    where tweet.user_id=${userId}
    group by tweet.tweet_id;`
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

//API 10
app.post('/user/tweets/', authentication, async (request, response) => {
  const {tweet} = request.body
  const userId = parseInt(request.userId)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const createTweetQuery = `insert into tweet (tweet, user_id, date_time)
    values ('${tweet}', '${userId}', '${dateTime}')`
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

//API 11
app.delete('/tweets/:tweetId/', authentication, async (request, response) => {
  const {twetId} = request.params
  const {userId} = request
  const getTheTweetQuery = `select * from tweet where user_id='${userId}' and tweet_id='${tweetId}';`
  const tweet = await db.get(getTheTweetQuery)
  console.log(tweet)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    deleteTweetQuery = `delete from tweet where tweet_id='${tweetId}';`
    await db.run(deleteTweetQuery)
    response.send('Tweet Removed')
  }
})

module.exports = app
