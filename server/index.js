const keys = require('./keys');

// Express App Setup
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Postgres Client Setup
const { Pool } = require('pg');
const pgClient = new Pool({
  user: keys.pgUser,
  host: keys.pgHost,
  database: keys.pgDatabase,
  password: keys.pgPassword,
  port: keys.pgPort
});
pgClient
  .connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.log('Error connecting to PostgreSQL:', err));

pgClient
  .query('CREATE TABLE IF NOT EXISTS "values" (number INT)')
  .then(() => console.log('Table "values" created or already exists'))
  .catch(err => {
    console.error('Error creating table:', err.message);
    console.error('Stack trace:', err.stack);
  });

// Redis Client Setup
const redis = require('redis');
const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000
});
const redisPublisher = redisClient.duplicate();

// Express route handlers

app.get('/', (req, res) => {
  res.send('Hi');
});

app.get('/values/all', async (req, res) => {
  const values = await pgClient.query('SELECT * from "values"');

  res.send(values.rows);
});

app.get('/values/current', async (req, res) => {
  redisClient.hgetall('values', (err, values) => {
    res.send(values);
  });
});
app.get('/values', async (req, res) => {
  try {
    // Fetch all values from PostgreSQL
    const pgValues = await pgClient.query('SELECT * FROM "values"');

    // Fetch all current values from Redis
    redisClient.hgetall('values', (err, redisValues) => {
      if (err) {
        return res.status(500).send('Error fetching values from Redis');
      }

      // Combine data from PostgreSQL and Redis
      res.send({
        postgres: pgValues.rows,
        redis: redisValues,
      });
    });
  } catch (err) {
    console.error('Error fetching values:', err.message);
    res.status(500).send('Error fetching values');
  }
});
app.post('/values', async (req, res) => {
  const index = req.body.index;

  if (parseInt(index) > 40) {
    const values = await pgClient.query('SELECT * from "values"');
    console.log(values.rows);
    return res.status(422).send('Index too high');
  }

  redisClient.hset('values', index, 'Nothing yet!');
  redisPublisher.publish('insert', index);
  pgClient.query('INSERT INTO "values"(number) VALUES($1);', [index]);

  res.send({ working: true });
});

app.listen(5000, err => {
  console.log('Listening');
});
